import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AttendanceCategory,
  AttendanceStatus,
  MediaPurpose,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { authHeader } from '../helpers/auth';
import { resetDatabase } from '../helpers/database';
import { createActiveStore } from '../helpers/fixtures';

jest.setTimeout(30000);

let protocolCounter = (Date.now() % 100000) + 1;

function uniqueCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextProtocol() {
  const value = String(protocolCounter).padStart(6, '0');
  protocolCounter += 1;
  return `SAC-20991231-${value}`;
}

type TestApp = {
  app: INestApplication;
  prisma: PrismaService;
};

async function createMediaTestApp(): Promise<TestApp> {
  process.env.N8N_INTEGRATION_TOKEN = 'test-token';
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/siac_new_test?schema=public';

  const attendancesModulePath = '../../src/attendances/attendances.module';
  const mediaModulePath = '../../src/media/media.module';
  const { AttendancesModule } = (await import(attendancesModulePath)) as {
    AttendancesModule: unknown;
  };
  const { MediaModule } = (await import(mediaModulePath)) as {
    MediaModule: unknown;
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, AttendancesModule as never, MediaModule as never],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

async function createAttendance(
  prisma: PrismaService,
  status: AttendanceStatus = 'started',
  externalConversationId?: string,
) {
  return prisma.attendance.create({
    data: {
      externalConversationId:
        externalConversationId ?? `conversation-${Math.random().toString(36).slice(2, 10)}`,
      status,
    },
  });
}

async function createCaseDirect(
  prisma: PrismaService,
  options: {
    attendanceId: string;
    status?: 'registered' | 'cancelled' | 'resolved';
    category?: AttendanceCategory;
    storeId?: string | null;
  },
) {
  return prisma.sacCase.create({
    data: {
      attendanceId: options.attendanceId,
      protocol: nextProtocol(),
      category: options.category ?? 'DENUNCIA',
      description: 'Descricao valida para caso de teste e2e.',
      status: options.status ?? 'registered',
      storeId: options.storeId ?? null,
      ...(options.status === 'cancelled' ? { cancelledAt: new Date() } : {}),
      ...(options.status === 'resolved' ? { resolvedAt: new Date() } : {}),
    },
  });
}

function validMediaPayload(overrides: Record<string, unknown> = {}) {
  return {
    externalMediaId: `media-${Math.random().toString(36).slice(2, 10)}`,
    sourceUrl: 'https://example.com/media.jpg',
    mimeType: 'image/jpeg',
    size: 123456,
    purpose: 'productImage',
    ...overrides,
  };
}

describe('SAC Media (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createMediaTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe('POST /sac-media', () => {
    it('requires token', async () => {
      await request(app.getHttpServer()).post('/sac-media').expect(401);
    });

    it('creates Attendance-linked media before Case exists', async () => {
      const attendance = await createAttendance(prisma, 'collecting_data');

      const response = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          ...validMediaPayload({ externalMediaId: 'attendance-media-1' }),
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          created: true,
          media: expect.objectContaining({
            id: expect.any(String),
            attendanceId: attendance.id,
            caseId: null,
            externalMediaId: 'attendance-media-1',
            storageProvider: 'external',
            purpose: 'productImage',
          }),
        }),
      );

      const cases = await prisma.sacCase.findMany({
        where: { attendanceId: attendance.id },
      });
      expect(cases).toHaveLength(0);
    });

    it('creates or reuses open Attendance from externalConversationId when attendanceId is absent', async () => {
      const existing = await createAttendance(
        prisma,
        'collecting_data',
        'conversation-media-reuse',
      );

      const response = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-media-reuse',
          ...validMediaPayload({ externalMediaId: 'media-with-conversation' }),
        })
        .expect(201);

      expect(response.body.media.attendanceId).toBe(existing.id);

      const attendanceCount = await prisma.attendance.count({
        where: { externalConversationId: 'conversation-media-reuse' },
      });
      expect(attendanceCount).toBe(1);
    });

    it('creates new Attendance when no open attendance exists for externalConversationId', async () => {
      await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-closed',
          status: 'fechado',
          closedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-closed',
          ...validMediaPayload({ externalMediaId: 'media-new-cycle' }),
        })
        .expect(201);

      const attendances = await prisma.attendance.findMany({
        where: { externalConversationId: 'conversation-closed' },
        orderBy: { createdAt: 'asc' },
      });
      expect(attendances).toHaveLength(2);
      expect(response.body.media.attendanceId).toBe(attendances[1].id);
      expect(attendances[1].status).toBe('started');
    });

    it('never creates Case from media alone', async () => {
      const response = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-no-case',
          ...validMediaPayload({ externalMediaId: 'media-no-case' }),
        })
        .expect(201);

      const cases = await prisma.sacCase.findMany({
        where: { attendanceId: response.body.media.attendanceId as string },
      });
      expect(cases).toHaveLength(0);
    });

    it('creates Case-linked media after Case exists and keeps attendanceId', async () => {
      const store = await createActiveStore(prisma, uniqueCode('401'));
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const sacCase = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        storeId: store.id,
      });

      const response = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          caseId: sacCase.id,
          ...validMediaPayload({ externalMediaId: 'case-linked-media' }),
        })
        .expect(201);

      expect(response.body.media).toEqual(
        expect.objectContaining({
          attendanceId: attendance.id,
          caseId: sacCase.id,
          externalMediaId: 'case-linked-media',
        }),
      );
    });

    it('validates Case belongs to Attendance', async () => {
      const store = await createActiveStore(prisma, uniqueCode('402'));
      const attendanceA = await createAttendance(prisma, 'collecting_data');
      const attendanceB = await createAttendance(prisma, 'collecting_data');
      const caseOnB = await createCaseDirect(prisma, {
        attendanceId: attendanceB.id,
        storeId: store.id,
      });

      await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendanceA.id,
          caseId: caseOnB.id,
          ...validMediaPayload({ externalMediaId: 'wrong-case-attendance' }),
        })
        .expect(400);
    });

    it('is idempotent by storageProvider + externalMediaId', async () => {
      const attendance = await createAttendance(prisma, 'collecting_data');

      const first = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          storageProvider: 'external',
          ...validMediaPayload({ externalMediaId: 'idempotent-media' }),
        })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          storageProvider: 'external',
          ...validMediaPayload({
            externalMediaId: 'idempotent-media',
            purpose: 'receiptImage',
          }),
        })
        .expect(200);

      expect(second.body.created).toBe(false);
      expect(second.body.media.id).toBe(first.body.media.id);
      expect(second.body.media.purpose).toBe('productImage');

      const mediaCount = await prisma.media.count({
        where: { externalMediaId: 'idempotent-media' },
      });
      expect(mediaCount).toBe(1);
    });

    it('defaults storageProvider to external', async () => {
      const attendance = await createAttendance(prisma, 'started');

      const response = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          ...validMediaPayload({ externalMediaId: 'default-provider-media' }),
        })
        .expect(201);

      expect(response.body.media.storageProvider).toBe('external');
    });

    it.each([
      'productImage',
      'receiptImage',
      'storePhoto',
      'other',
    ] as MediaPurpose[])('accepts purpose %s', async (purpose) => {
      const attendance = await createAttendance(prisma, 'started');

      const response = await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          ...validMediaPayload({
            externalMediaId: `purpose-${purpose}`,
            purpose,
          }),
        })
        .expect(201);

      expect(response.body.media.purpose).toBe(purpose);
    });

    it('rejects media attachment while Attendance is pesquisa_satisfacao', async () => {
      const attendance = await createAttendance(prisma, 'pesquisa_satisfacao');

      await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          ...validMediaPayload({ externalMediaId: 'pesquisa-media' }),
        })
        .expect(400);
    });

    it('expired or inaccessible storageStatus does not affect Case validity', async () => {
      const store = await createActiveStore(prisma, uniqueCode('403'));
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const sacCase = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        storeId: store.id,
        status: 'registered',
      });

      for (const storageStatus of ['expired', 'inaccessible']) {
        await request(app.getHttpServer())
          .post('/sac-media')
          .set(authHeader())
          .send({
            attendanceId: attendance.id,
            caseId: sacCase.id,
            storageStatus,
            ...validMediaPayload({ externalMediaId: `media-${storageStatus}` }),
          })
          .expect(201);
      }

      const unchangedCase = await prisma.sacCase.findUniqueOrThrow({
        where: { id: sacCase.id },
      });
      expect(unchangedCase.status).toBe('registered');
    });

    it('requires either attendanceId or externalConversationId', async () => {
      await request(app.getHttpServer())
        .post('/sac-media')
        .set(authHeader())
        .send(validMediaPayload({ externalMediaId: 'missing-attendance-ref' }))
        .expect(400);
    });
  });

  describe('Attendance detail media aggregation', () => {
    it('includes attendance-linked, case-linked, and cancelled case media', async () => {
      const store = await createActiveStore(prisma, uniqueCode('404'));
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const activeCase = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        storeId: store.id,
        status: 'registered',
      });
      const cancelledCase = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        storeId: store.id,
        status: 'cancelled',
      });

      await prisma.media.create({
        data: {
          attendanceId: attendance.id,
          externalMediaId: 'attendance-only-media',
          purpose: 'other',
        },
      });
      await prisma.media.create({
        data: {
          attendanceId: attendance.id,
          caseId: activeCase.id,
          externalMediaId: 'active-case-media',
          purpose: 'productImage',
        },
      });
      await prisma.media.create({
        data: {
          attendanceId: attendance.id,
          caseId: cancelledCase.id,
          externalMediaId: 'cancelled-case-media',
          purpose: 'receiptImage',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .expect(200);

      const externalIds = (response.body.media as Array<{ externalMediaId: string }>).map(
        (item) => item.externalMediaId,
      );
      expect(externalIds).toEqual(
        expect.arrayContaining([
          'attendance-only-media',
          'active-case-media',
          'cancelled-case-media',
        ]),
      );
      expect(response.body.media).toHaveLength(3);
    });
  });
});
