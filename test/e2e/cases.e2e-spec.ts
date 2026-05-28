import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AttendanceCategory,
  AttendanceStatus,
  CaseStatus,
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

async function createCasesTestApp(): Promise<TestApp> {
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

async function createAttendance(
  prisma: PrismaService,
  status: AttendanceStatus = 'started',
  externalConversationId?: string,
) {
  return prisma.attendance.create({
    data: {
      externalConversationId: externalConversationId ?? `conversation-${Math.random().toString(36).slice(2, 10)}`,
      status,
    },
  });
}

async function createCaseDirect(
  prisma: PrismaService,
  options: {
    attendanceId: string;
    status?: CaseStatus;
    category?: AttendanceCategory;
    storeId?: string | null;
    resolvedAt?: Date | null;
    sentToDkwAt?: Date | null;
    cancelledAt?: Date | null;
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
      resolvedAt: options.resolvedAt ?? null,
      sentToDkwAt: options.sentToDkwAt ?? null,
      cancelledAt: options.cancelledAt ?? null,
    },
  });
}

function validCreatePayload(attendanceId: string, storeId: string) {
  return {
    attendanceId,
    category: 'DENUNCIA',
    description: 'Cliente relatou um problema importante com detalhes suficientes.',
    storeId,
  };
}

describe('SAC Cases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createCasesTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe('POST /sac-cases', () => {
    it('requires token', async () => {
      await request(app.getHttpServer()).post('/sac-cases').expect(401);
    });

    it('creates case with protocol and default status, then moves attendance to waiting_resolution', async () => {
      const store = await createActiveStore(prisma, uniqueCode('301'));
      const attendance = await createAttendance(prisma, 'started');

      const response = await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, store.id))
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          attendanceId: attendance.id,
          protocol: expect.stringMatching(/^SAC-\d{8}-\d{6}$/),
          category: 'DENUNCIA',
          status: 'registered',
          needsHumanReview: false,
          riskFlag: false,
        }),
      );
      expect(response.body.sentToDkwAt).toBeNull();

      const updatedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(updatedAttendance.status).toBe('waiting_resolution');
    });

    it('sets sent_to_dkw and sentToDkwAt when markAsSentToDkw=true', async () => {
      const store = await createActiveStore(prisma, uniqueCode('302'));
      const attendance = await createAttendance(prisma, 'collecting_data');

      const response = await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          markAsSentToDkw: true,
        })
        .expect(201);

      expect(response.body.status).toBe('sent_to_dkw');
      expect(response.body.sentToDkwAt).not.toBeNull();
    });

    it.each([
      'waiting_resolution',
      'pesquisa_satisfacao',
      'fechado',
      'cancelled',
    ] as AttendanceStatus[])('rejects attendance status %s', async (status) => {
      const store = await createActiveStore(prisma, uniqueCode(`s-${status}`));
      const attendance = await createAttendance(prisma, status);

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, store.id))
        .expect(400);
    });

    it.each(['RH', 'DP', 'CURRICULO', 'FORNECEDOR', 'INFORMACAO_LOJA'] as AttendanceCategory[])(
      'rejects category that should not create case: %s',
      async (category) => {
        const store = await createActiveStore(prisma, uniqueCode(`no-case-${category}`));
        const attendance = await createAttendance(prisma, 'started');

        await request(app.getHttpServer())
          .post('/sac-cases')
          .set(authHeader())
          .send({
            ...validCreatePayload(attendance.id, store.id),
            category,
          })
          .expect(400);
      },
    );

    it('rejects duplicate active case with 409', async () => {
      const store = await createActiveStore(prisma, uniqueCode('303'));
      const attendance = await createAttendance(prisma, 'started');
      await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'registered',
        storeId: store.id,
      });

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, store.id))
        .expect(409);
    });

    it('allows new case when previous case is cancelled', async () => {
      const store = await createActiveStore(prisma, uniqueCode('304'));
      const attendance = await createAttendance(prisma, 'started');
      await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'cancelled',
        storeId: store.id,
        cancelledAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, store.id))
        .expect(201);

      const cases = await prisma.sacCase.findMany({
        where: { attendanceId: attendance.id },
      });
      expect(cases).toHaveLength(2);
      expect(response.body.status).toBe('registered');
    });

    it('auto-links replacedByCaseId when there is exactly one cancelled candidate', async () => {
      const store = await createActiveStore(prisma, uniqueCode('305'));
      const attendance = await createAttendance(prisma, 'started');
      const cancelled = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'cancelled',
        storeId: store.id,
        cancelledAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, store.id))
        .expect(201);

      const updatedCancelled = await prisma.sacCase.findUniqueOrThrow({
        where: { id: cancelled.id },
      });
      expect(updatedCancelled.replacedByCaseId).toBe(response.body.id);
    });

    it('fails when replacement candidate is ambiguous', async () => {
      const store = await createActiveStore(prisma, uniqueCode('306'));
      const attendance = await createAttendance(prisma, 'started');
      await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'cancelled',
        storeId: store.id,
        cancelledAt: new Date(),
      });
      await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'cancelled',
        storeId: store.id,
        cancelledAt: new Date(),
      });

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, store.id))
        .expect(409);
    });

    it('rejects unknown storeId', async () => {
      const attendance = await createAttendance(prisma, 'started');

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, 'cmunknownstore'))
        .expect(400);
    });

    it('rejects inactive storeId', async () => {
      const attendance = await createAttendance(prisma, 'started');
      const inactiveStore = await prisma.store.create({
        data: {
          internalStoreCode: uniqueCode('inactive'),
          name: 'Loja Inativa',
          city: 'Bage',
          state: 'RS',
          address: 'Rua Inativa',
          active: false,
          aliases: ['inativa'],
        },
      });

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send(validCreatePayload(attendance.id, inactiveStore.id))
        .expect(400);
    });

    it('allows missing storeId only when missingRequiredFields includes storeId', async () => {
      const attendance = await createAttendance(prisma, 'started');

      const response = await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          category: 'DENUNCIA',
          description: 'Descricao sem loja, mas campo obrigatorio faltante informado.',
          missingRequiredFields: ['storeId'],
        })
        .expect(201);

      expect(response.body.storeId).toBeNull();
      expect(response.body.needsHumanReview).toBe(true);
    });

    it('rejects missing storeId when storeId is not listed in missingRequiredFields', async () => {
      const attendance = await createAttendance(prisma, 'started');

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          attendanceId: attendance.id,
          category: 'DENUNCIA',
          description: 'Descricao sem loja e sem justificativa correta.',
        })
        .expect(400);
    });

    it('validates description min and max length', async () => {
      const store = await createActiveStore(prisma, uniqueCode('308'));
      const attendance = await createAttendance(prisma, 'started');

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          description: '123456789',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          description: 'a'.repeat(2001),
        })
        .expect(400);
    });

    it('rejects description inside missingRequiredFields', async () => {
      const store = await createActiveStore(prisma, uniqueCode('309'));
      const attendance = await createAttendance(prisma, 'started');

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          missingRequiredFields: ['description'],
        })
        .expect(400);
    });

    it('normalizes needsHumanReview=true when missingRequiredFields is not empty', async () => {
      const store = await createActiveStore(prisma, uniqueCode('310'));
      const attendance = await createAttendance(prisma, 'started');

      const response = await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          needsHumanReview: false,
          missingRequiredFields: ['productImage'],
        })
        .expect(201);

      expect(response.body.needsHumanReview).toBe(true);
      expect(response.body.missingRequiredFields).toEqual(['productImage']);
    });

    it('requires riskReasons when riskFlag=true', async () => {
      const store = await createActiveStore(prisma, uniqueCode('311'));
      const attendance = await createAttendance(prisma, 'started');

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          riskFlag: true,
        })
        .expect(400);
    });

    it('normalizes riskFlag=true when riskReasons is non-empty', async () => {
      const store = await createActiveStore(prisma, uniqueCode('312'));
      const attendance = await createAttendance(prisma, 'started');

      const response = await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          riskFlag: false,
          riskReasons: ['social_media'],
        })
        .expect(201);

      expect(response.body.riskFlag).toBe(true);
      expect(response.body.riskReasons).toEqual(['social_media']);
      expect(response.body.needsHumanReview).toBe(false);
    });

    it('rejects unknown values in missingRequiredFields', async () => {
      const store = await createActiveStore(prisma, uniqueCode('313'));
      const attendance = await createAttendance(prisma, 'started');

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          missingRequiredFields: ['campoInvalido'],
        })
        .expect(400);
    });

    it('rejects unknown values in riskReasons', async () => {
      const store = await createActiveStore(prisma, uniqueCode('314'));
      const attendance = await createAttendance(prisma, 'started');

      await request(app.getHttpServer())
        .post('/sac-cases')
        .set(authHeader())
        .send({
          ...validCreatePayload(attendance.id, store.id),
          riskReasons: ['motivoInvalido'],
        })
        .expect(400);
    });

    it('handles concurrent duplicate case creation with 409', async () => {
      const store = await createActiveStore(prisma, uniqueCode('315'));
      const attendance = await createAttendance(prisma, 'started');
      const payload = validCreatePayload(attendance.id, store.id);

      const [first, second] = await Promise.all([
        request(app.getHttpServer()).post('/sac-cases').set(authHeader()).send(payload),
        request(app.getHttpServer()).post('/sac-cases').set(authHeader()).send(payload),
      ]);

      expect([first.status, second.status].sort()).toEqual([201, 409]);
    });
  });

  describe('PATCH /sac-cases/:id/status', () => {
    it('transitions registered -> sent_to_dkw and is idempotent preserving sentToDkwAt', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'registered',
      });

      const first = await request(app.getHttpServer())
        .patch(`/sac-cases/${caseItem.id}/status`)
        .set(authHeader())
        .send({ status: 'sent_to_dkw' })
        .expect(200);

      const firstTimestamp = first.body.sentToDkwAt as string;
      expect(first.body.status).toBe('sent_to_dkw');
      expect(firstTimestamp).toBeTruthy();

      const second = await request(app.getHttpServer())
        .patch(`/sac-cases/${caseItem.id}/status`)
        .set(authHeader())
        .send({ status: 'sent_to_dkw' })
        .expect(200);

      expect(second.body.status).toBe('sent_to_dkw');
      expect(second.body.sentToDkwAt).toBe(firstTimestamp);
    });

    it.each(['resolved', 'cancelled'] as CaseStatus[])(
      'rejects sent_to_dkw transition from %s',
      async (status) => {
        const attendance = await createAttendance(prisma, 'waiting_resolution');
        const caseItem = await createCaseDirect(prisma, {
          attendanceId: attendance.id,
          status,
          resolvedAt: status === 'resolved' ? new Date() : null,
          cancelledAt: status === 'cancelled' ? new Date() : null,
        });

        await request(app.getHttpServer())
          .patch(`/sac-cases/${caseItem.id}/status`)
          .set(authHeader())
          .send({ status: 'sent_to_dkw' })
          .expect(400);
      },
    );

    it('transitions registered -> in_resolution and keeps idempotency', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'registered',
      });

      const first = await request(app.getHttpServer())
        .patch(`/sac-cases/${caseItem.id}/status`)
        .set(authHeader())
        .send({ status: 'in_resolution' })
        .expect(200);

      expect(first.body.status).toBe('in_resolution');

      const second = await request(app.getHttpServer())
        .patch(`/sac-cases/${caseItem.id}/status`)
        .set(authHeader())
        .send({ status: 'in_resolution' })
        .expect(200);

      expect(second.body.status).toBe('in_resolution');
    });

    it.each(['resolved', 'cancelled'] as CaseStatus[])(
      'rejects in_resolution transition from %s',
      async (status) => {
        const attendance = await createAttendance(prisma, 'waiting_resolution');
        const caseItem = await createCaseDirect(prisma, {
          attendanceId: attendance.id,
          status,
          resolvedAt: status === 'resolved' ? new Date() : null,
          cancelledAt: status === 'cancelled' ? new Date() : null,
        });

        await request(app.getHttpServer())
          .patch(`/sac-cases/${caseItem.id}/status`)
          .set(authHeader())
          .send({ status: 'in_resolution' })
          .expect(400);
      },
    );

    it('transitions to resolved and moves attendance to pesquisa_satisfacao', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'registered',
      });

      const response = await request(app.getHttpServer())
        .patch(`/sac-cases/${caseItem.id}/status`)
        .set(authHeader())
        .send({ status: 'resolved' })
        .expect(200);

      expect(response.body.status).toBe('resolved');
      expect(response.body.resolvedAt).toBeTruthy();

      const updatedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(updatedAttendance.status).toBe('pesquisa_satisfacao');
      expect(updatedAttendance.satisfactionRequestedAt).not.toBeNull();
    });

    it('keeps resolvedAt on idempotent resolved calls', async () => {
      const attendance = await createAttendance(prisma, 'pesquisa_satisfacao');
      const resolvedAt = new Date('2026-05-24T13:00:00.000Z');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'resolved',
        resolvedAt,
      });

      const response = await request(app.getHttpServer())
        .patch(`/sac-cases/${caseItem.id}/status`)
        .set(authHeader())
        .send({ status: 'resolved' })
        .expect(200);

      expect(response.body.status).toBe('resolved');
      expect(response.body.resolvedAt).toBe(resolvedAt.toISOString());
    });

    it('repairs inconsistency when case is resolved but attendance is still waiting_resolution', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const resolvedAt = new Date('2026-05-24T14:00:00.000Z');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'resolved',
        resolvedAt,
      });

      const response = await request(app.getHttpServer())
        .patch(`/sac-cases/${caseItem.id}/status`)
        .set(authHeader())
        .send({ status: 'resolved' })
        .expect(200);

      expect(response.body.resolvedAt).toBe(resolvedAt.toISOString());

      const repairedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(repairedAttendance.status).toBe('pesquisa_satisfacao');
      expect(repairedAttendance.satisfactionRequestedAt).not.toBeNull();
    });
  });

  describe('POST /sac-cases/:id/cancel', () => {
    it('cancels case before resolved and stores cancellation reason', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'in_resolution',
      });

      const response = await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/cancel`)
        .set(authHeader())
        .send({
          caseCancellationReason: 'operational_duplicate',
        })
        .expect(200);

      expect(response.body.status).toBe('cancelled');
      expect(response.body.caseCancellationReason).toBe('operational_duplicate');
      expect(response.body.cancelledAt).toBeTruthy();
    });

    it('rejects cancel when case is resolved', async () => {
      const attendance = await createAttendance(prisma, 'pesquisa_satisfacao');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'resolved',
        resolvedAt: new Date(),
      });

      await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/cancel`)
        .set(authHeader())
        .send({
          caseCancellationReason: 'operational_duplicate',
        })
        .expect(400);
    });

    it('allows returnAttendanceToCollectingData only for created_by_mistake or wrong_routing', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'registered',
      });

      await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/cancel`)
        .set(authHeader())
        .send({
          caseCancellationReason: 'operational_duplicate',
          returnAttendanceToCollectingData: true,
        })
        .expect(400);
    });

    it('moves attendance back to collecting_data when returnAttendanceToCollectingData=true and reason allows it', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'registered',
      });

      await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/cancel`)
        .set(authHeader())
        .send({
          caseCancellationReason: 'wrong_routing',
          returnAttendanceToCollectingData: true,
        })
        .expect(200);

      const updatedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(updatedAttendance.status).toBe('collecting_data');
    });

    it('may cancel attendance automatically when no useful demand remains', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
        status: 'registered',
      });

      await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/cancel`)
        .set(authHeader())
        .send({
          caseCancellationReason: 'other',
          lastSummary: 'Demanda encerrada sem continuidade.',
          returnAttendanceToCollectingData: false,
        })
        .expect(200);

      const updatedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(updatedAttendance.status).toBe('cancelled');
      expect(updatedAttendance.closedAt).not.toBeNull();
      expect(updatedAttendance.lastSummary).toBe('Demanda encerrada sem continuidade.');
    });
  });

  describe('POST /sac-cases/:id/protocol-sent', () => {
    it('stores explicit sentAt timestamp', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
      });
      const sentAt = '2026-05-24T15:30:00.000Z';

      const response = await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/protocol-sent`)
        .set(authHeader())
        .send({ sentAt })
        .expect(200);

      expect(response.body.protocolSentToCustomerAt).toBe(sentAt);
    });

    it('is idempotent and does not overwrite first protocolSentToCustomerAt', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
      });

      const first = await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/protocol-sent`)
        .set(authHeader())
        .send({ sentAt: '2026-05-24T16:00:00.000Z' })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/protocol-sent`)
        .set(authHeader())
        .send({ sentAt: '2026-05-24T18:00:00.000Z' })
        .expect(200);

      expect(second.body.protocolSentToCustomerAt).toBe(first.body.protocolSentToCustomerAt);
    });

    it('uses backend time when sentAt is omitted', async () => {
      const attendance = await createAttendance(prisma, 'waiting_resolution');
      const caseItem = await createCaseDirect(prisma, {
        attendanceId: attendance.id,
      });
      const before = new Date();

      const response = await request(app.getHttpServer())
        .post(`/sac-cases/${caseItem.id}/protocol-sent`)
        .set(authHeader())
        .send({})
        .expect(200);

      const after = new Date();
      const timestamp = new Date(response.body.protocolSentToCustomerAt as string);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 2000);
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 2000);
    });

    it('returns 404 for unknown case', async () => {
      await request(app.getHttpServer())
        .post('/sac-cases/case-not-found/protocol-sent')
        .set(authHeader())
        .send({})
        .expect(404);
    });
  });
});
