import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { authHeader } from '../helpers/auth';
import { createActiveStore } from '../helpers/fixtures';

jest.setTimeout(30000);

function uniqueCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type TestApp = {
  app: INestApplication;
  prisma: PrismaService;
};

async function createCasesReadsTestApp(): Promise<TestApp> {
  process.env.N8N_INTEGRATION_TOKEN = 'test-token';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/siac_new_test?schema=public';

  const modulePath = '../../src/cases/cases.module';
  const { CasesModule } = (await import(modulePath)) as {
    CasesModule: unknown;
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, CasesModule as never],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

describe('SAC Cases Reads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createCasesReadsTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /sac-cases/:id', () => {
    it('requires token', async () => {
      await request(app.getHttpServer()).get('/sac-cases/any-id').expect(401);
    });

    it('returns case with summarized attendance', async () => {
      const store = await createActiveStore(prisma, uniqueCode('401'));
      const protocol = `SAC-20990101-${Math.floor(Math.random() * 900000 + 100000)}`;
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-read-1',
          status: 'waiting_resolution',
        },
      });
      const caseItem = await prisma.sacCase.create({
        data: {
          attendanceId: attendance.id,
          protocol,
          category: 'DENUNCIA',
          description: 'Descricao para leitura detalhada de caso.',
          status: 'registered',
          storeId: store.id,
          needsHumanReview: true,
          missingRequiredFields: ['productImage'],
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/sac-cases/${caseItem.id}`)
        .set(authHeader())
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: caseItem.id,
          protocol,
          category: 'DENUNCIA',
          attendance: expect.objectContaining({
            attendanceId: attendance.id,
            status: 'waiting_resolution',
            externalConversationId: 'conversation-read-1',
            createdAt: expect.any(String),
            closedAt: null,
          }),
        }),
      );
    });

    it('returns 404 for unknown id', async () => {
      await request(app.getHttpServer())
        .get('/sac-cases/case-not-found')
        .set(authHeader())
        .expect(404);
    });
  });

  describe('GET /sac-cases/by-protocol/:protocol', () => {
    it('finds case by protocol ignoring case and surrounding spaces', async () => {
      const store = await createActiveStore(prisma, uniqueCode('402'));
      const protocol = `SAC-20990101-${Math.floor(Math.random() * 900000 + 100000)}`;
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-read-2',
          status: 'waiting_resolution',
        },
      });
      const caseItem = await prisma.sacCase.create({
        data: {
          attendanceId: attendance.id,
          protocol,
          category: 'DENUNCIA',
          description: 'Descricao para leitura por protocolo.',
          status: 'registered',
          storeId: store.id,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/sac-cases/by-protocol/%20%20${encodeURIComponent(protocol.toLowerCase())}%20%20`)
        .set(authHeader())
        .expect(200);

      expect(response.body.id).toBe(caseItem.id);
      expect(response.body.protocol).toBe(protocol);
    });

    it('requires protocol with hyphens', async () => {
      await request(app.getHttpServer())
        .get('/sac-cases/by-protocol/SAC20260524000010')
        .set(authHeader())
        .expect(400);
    });

    it('finds cancelled case as well', async () => {
      const store = await createActiveStore(prisma, uniqueCode('403'));
      const protocol = `SAC-20990101-${Math.floor(Math.random() * 900000 + 100000)}`;
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-read-3',
          status: 'waiting_resolution',
        },
      });
      const caseItem = await prisma.sacCase.create({
        data: {
          attendanceId: attendance.id,
          protocol,
          category: 'DENUNCIA',
          description: 'Descricao de caso cancelado para leitura.',
          status: 'cancelled',
          storeId: store.id,
          caseCancellationReason: 'operational_duplicate',
          cancelledAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/sac-cases/by-protocol/${protocol}`)
        .set(authHeader())
        .expect(200);

      expect(response.body.id).toBe(caseItem.id);
      expect(response.body.status).toBe('cancelled');
    });

    it('includes replacedBy when present', async () => {
      const store = await createActiveStore(prisma, uniqueCode('404'));
      const baseSequence = Math.floor(Math.random() * 899999) + 100000;
      const replacementProtocol = `SAC-20990101-${String(baseSequence).padStart(6, '0')}`;
      const cancelledProtocol = `SAC-20990101-${String(baseSequence + 1).padStart(6, '0')}`;
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-read-4',
          status: 'waiting_resolution',
        },
      });

      const replacement = await prisma.sacCase.create({
        data: {
          attendanceId: attendance.id,
          protocol: replacementProtocol,
          category: 'DENUNCIA',
          description: 'Caso substituto.',
          status: 'registered',
          storeId: store.id,
        },
      });

      const cancelled = await prisma.sacCase.create({
        data: {
          attendanceId: attendance.id,
          protocol: cancelledProtocol,
          category: 'DENUNCIA',
          description: 'Caso cancelado substituido.',
          status: 'cancelled',
          storeId: store.id,
          caseCancellationReason: 'created_by_mistake',
          cancelledAt: new Date(),
          replacedByCaseId: replacement.id,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/sac-cases/by-protocol/${cancelledProtocol}`)
        .set(authHeader())
        .expect(200);

      expect(response.body.id).toBe(cancelled.id);
      expect(response.body.replacedBy).toEqual(
        expect.objectContaining({
          id: replacement.id,
          protocol: replacement.protocol,
          status: replacement.status,
        }),
      );
    });
  });

  describe('GET /sac-cases', () => {
    it('returns 404 because global list is disabled', async () => {
      await request(app.getHttpServer())
        .get('/sac-cases')
        .set(authHeader())
        .expect(404);
    });
  });
});
