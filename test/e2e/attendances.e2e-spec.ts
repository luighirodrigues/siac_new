import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AttendanceCategory,
  AttendanceStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { authHeader } from '../helpers/auth';
import { resetDatabase } from '../helpers/database';
import { configureTestEnvironment } from '../helpers/environment';
import { createActiveStore } from '../helpers/fixtures';

jest.setTimeout(30000);

type TestApp = {
  app: INestApplication;
  prisma: PrismaService;
};

async function createAttendancesTestApp(): Promise<TestApp> {
  configureTestEnvironment();

  const attendancesModulePath = '../../src/attendances/attendances.module';
  const { AttendancesModule } = (await import(attendancesModulePath)) as {
    AttendancesModule: unknown;
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, AttendancesModule as never],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

function expectAttendanceDetailShape(
  body: Record<string, unknown>,
  expected: { externalConversationId: string; status: AttendanceStatus },
) {
  expect(body).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      externalConversationId: expected.externalConversationId,
      status: expected.status,
      closedWithoutSatisfaction: expect.any(Boolean),
      cases: expect.any(Array),
      media: expect.any(Array),
    }),
  );

  expect(body).toHaveProperty('detectedCategory');
  expect(body).toHaveProperty('lastSummary');
  expect(body).toHaveProperty('closedAt');
  expect(body).toHaveProperty('cancellationReason');
  expect(body).toHaveProperty('satisfactionRequestedAt');
  expect(body).toHaveProperty('satisfactionRespondedAt');
  expect(body).toHaveProperty('satisfactionResponse');
}

describe('SAC Attendances (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createAttendancesTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe('POST /sac-attendances', () => {
    it('requires token', async () => {
      await request(app.getHttpServer()).post('/sac-attendances').expect(401);
    });

    it('creates new with 201 and reused false', async () => {
      const response = await request(app.getHttpServer())
        .post('/sac-attendances')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-1',
          lastSummary: 'Resumo inicial',
        })
        .expect(201);

      expect(response.body.reused).toBe(false);
      expectAttendanceDetailShape(response.body.attendance, {
        externalConversationId: 'conversation-1',
        status: 'started',
      });
      expect(response.body.attendance).toEqual(
        expect.objectContaining({
          lastSummary: 'Resumo inicial',
          cases: [],
          media: [],
          satisfactionResponse: null,
        }),
      );
    });

    it('reuses open attendance by externalConversationId with 200 and reused true', async () => {
      const existing = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-2',
          status: 'started',
          lastSummary: 'Resumo antigo',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sac-attendances')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-2',
          lastSummary: 'Resumo novo',
        })
        .expect(200);

      expect(response.body.reused).toBe(true);
      expect(response.body.attendance.id).toBe(existing.id);
    });

    it('updates lastSummary on reuse', async () => {
      const existing = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-3',
          status: 'collecting_data',
          lastSummary: 'Antes',
        },
      });

      await request(app.getHttpServer())
        .post('/sac-attendances')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-3',
          lastSummary: 'Depois',
        })
        .expect(200);

      const updated = await prisma.attendance.findUniqueOrThrow({
        where: { id: existing.id },
      });
      expect(updated.lastSummary).toBe('Depois');
    });

    it('does not store lastMessageAt', async () => {
      const response = await request(app.getHttpServer())
        .post('/sac-attendances')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-4',
          lastSummary: 'Sem lastMessageAt',
          lastMessageAt: '2026-05-24T12:00:00.000Z',
        })
        .expect(201);

      const created = await prisma.attendance.findUniqueOrThrow({
        where: { id: response.body.attendance.id as string },
      });

      expect(created).toEqual(
        expect.objectContaining({
          externalConversationId: 'conversation-4',
          lastSummary: 'Sem lastMessageAt',
        }),
      );
      expect((response.body.attendance as Record<string, unknown>).lastMessageAt).toBeUndefined();
    });

    it('creates new when previous is fechado', async () => {
      await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-5',
          status: 'fechado',
          closedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sac-attendances')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-5',
        })
        .expect(201);

      expect(response.body.reused).toBe(false);
      expect(response.body.attendance.status).toBe('started');
    });

    it('creates new when previous is cancelled', async () => {
      await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-6',
          status: 'cancelled',
          cancellationReason: 'timeout',
          closedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sac-attendances')
        .set(authHeader())
        .send({
          externalConversationId: 'conversation-6',
        })
        .expect(201);

      expect(response.body.reused).toBe(false);
      expect(response.body.attendance.status).toBe('started');
    });

    it('handles concurrent createOrReuse for the same externalConversationId', async () => {
      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post('/sac-attendances')
          .set(authHeader())
          .send({ externalConversationId: 'conversation-concurrent' }),
        request(app.getHttpServer())
          .post('/sac-attendances')
          .set(authHeader())
          .send({ externalConversationId: 'conversation-concurrent' }),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 201]);

      const openCount = await prisma.attendance.count({
        where: {
          externalConversationId: 'conversation-concurrent',
          status: {
            in: ['started', 'collecting_data', 'waiting_resolution', 'pesquisa_satisfacao'],
          },
        },
      });

      expect(openCount).toBe(1);
    });
  });

  describe('GET /sac-attendances/by-external-conversation/:externalConversationId', () => {
    it('returns open attendance detail when one exists among closed cycles', async () => {
      await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-open',
          status: 'fechado',
          closedAt: new Date(),
        },
      });

      const openAttendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-open',
          status: 'waiting_resolution',
          lastSummary: 'Atendimento aberto atual',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/sac-attendances/by-external-conversation/conversation-open')
        .set(authHeader())
        .expect(200);

      expect(response.body.id).toBe(openAttendance.id);
      expect(response.body.status).toBe('waiting_resolution');
      expect(response.body.cases).toEqual([]);
      expect(response.body.media).toEqual([]);
      expect(response.body.satisfactionResponse).toBeNull();
    });

    it('404 when no open exists', async () => {
      await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-none',
          status: 'fechado',
          closedAt: new Date(),
        },
      });

      await request(app.getHttpServer())
        .get('/sac-attendances/by-external-conversation/conversation-none')
        .set(authHeader())
        .expect(404);
    });

    it.each([
      'started',
      'collecting_data',
      'waiting_resolution',
      'pesquisa_satisfacao',
    ] as AttendanceStatus[])('recognizes %s as open status', async (status) => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: `conversation-${status}`,
          status,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/sac-attendances/by-external-conversation/conversation-${status}`)
        .set(authHeader())
        .expect(200);

      expect(response.body.id).toBe(attendance.id);
      expect(response.body.status).toBe(status);
    });
  });

  describe('GET /sac-attendances', () => {
    it('uses default limit=20 and orders newest first', async () => {
      const createdIds: string[] = [];
      for (let index = 1; index <= 25; index += 1) {
        const attendance = await prisma.attendance.create({
          data: {
            externalConversationId: `conversation-default-limit-${index}`,
          },
        });
        createdIds.push(attendance.id);
      }

      const response = await request(app.getHttpServer())
        .get('/sac-attendances')
        .set(authHeader())
        .expect(200);

      expect(response.body).toHaveLength(20);
      expect(response.body[0].id).toBe(createdIds[24]);
      expect(response.body[19].id).toBe(createdIds[5]);
    });

    it('caps max limit at 100', async () => {
      for (let index = 1; index <= 120; index += 1) {
        await prisma.attendance.create({
          data: {
            externalConversationId: `conversation-max-limit-${index}`,
          },
        });
      }

      const response = await request(app.getHttpServer())
        .get('/sac-attendances?limit=300')
        .set(authHeader())
        .expect(200);

      expect(response.body).toHaveLength(100);
    });

    it('paginates with page and limit', async () => {
      const createdIds: string[] = [];
      for (let index = 1; index <= 25; index += 1) {
        const attendance = await prisma.attendance.create({
          data: {
            externalConversationId: `conversation-page-${index}`,
          },
        });
        createdIds.push(attendance.id);
      }

      const page1 = await request(app.getHttpServer())
        .get('/sac-attendances?page=1&limit=10')
        .set(authHeader())
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/sac-attendances?page=2&limit=10')
        .set(authHeader())
        .expect(200);

      expect(page1.body).toHaveLength(10);
      expect(page2.body).toHaveLength(10);
      expect(page1.body[0].id).toBe(createdIds[24]);
      expect(page2.body[0].id).toBe(createdIds[14]);
      expect(page1.body.map((item: { id: string }) => item.id)).not.toEqual(
        page2.body.map((item: { id: string }) => item.id),
      );
    });

    it('filters by status', async () => {
      await prisma.attendance.create({
        data: {
          externalConversationId: 'filter-status-1',
          status: 'started',
        },
      });
      const target = await prisma.attendance.create({
        data: {
          externalConversationId: 'filter-status-2',
          status: 'waiting_resolution',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/sac-attendances?status=waiting_resolution')
        .set(authHeader())
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(target.id);
    });

    it('filters by externalConversationId', async () => {
      const target = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-filter-target',
        },
      });
      await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-filter-other',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/sac-attendances?externalConversationId=conversation-filter-target')
        .set(authHeader())
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(target.id);
    });

    it('filters by createdFrom and createdTo', async () => {
      await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-created-at-older',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const from = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const target = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-created-at-target',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const to = new Date().toISOString();

      const response = await request(app.getHttpServer())
        .get(`/sac-attendances?createdFrom=${encodeURIComponent(from)}&createdTo=${encodeURIComponent(to)}`)
        .set(authHeader())
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(target.id);
    });

    it('filters hasCase=true by non-cancelled case', async () => {
      const store = await createActiveStore(prisma, '101');

      const withCase = await prisma.attendance.create({
        data: {
          externalConversationId: 'has-case-true',
        },
      });

      const cancelledCaseOnly = await prisma.attendance.create({
        data: {
          externalConversationId: 'has-case-cancelled-only',
        },
      });

      await prisma.attendance.create({
        data: {
          externalConversationId: 'has-case-none',
        },
      });

      await prisma.sacCase.create({
        data: {
          attendanceId: withCase.id,
          protocol: '202605240001',
          category: 'INFORMACAO_LOJA',
          description: 'Caso ativo',
          status: 'registered',
          storeId: store.id,
        },
      });

      await prisma.sacCase.create({
        data: {
          attendanceId: cancelledCaseOnly.id,
          protocol: '202605240002',
          category: 'INFORMACAO_LOJA',
          description: 'Caso cancelado',
          status: 'cancelled',
          storeId: store.id,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/sac-attendances?hasCase=true')
        .set(authHeader())
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(withCase.id);
    });

    it('filters hasCase=false excluding non-cancelled case', async () => {
      const store = await createActiveStore(prisma, '102');

      const withoutCase = await prisma.attendance.create({
        data: {
          externalConversationId: 'has-case-false-none',
        },
      });

      const cancelledCaseOnly = await prisma.attendance.create({
        data: {
          externalConversationId: 'has-case-false-cancelled',
        },
      });

      const withOpenCase = await prisma.attendance.create({
        data: {
          externalConversationId: 'has-case-false-open',
        },
      });

      await prisma.sacCase.create({
        data: {
          attendanceId: cancelledCaseOnly.id,
          protocol: '202605240003',
          category: 'INFORMACAO_LOJA',
          description: 'Caso cancelado',
          status: 'cancelled',
          storeId: store.id,
        },
      });

      await prisma.sacCase.create({
        data: {
          attendanceId: withOpenCase.id,
          protocol: '202605240004',
          category: 'INFORMACAO_LOJA',
          description: 'Caso ativo',
          status: 'registered',
          storeId: store.id,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/sac-attendances?hasCase=false')
        .set(authHeader())
        .expect(200);

      const ids = response.body.map((attendance: { id: string }) => attendance.id);
      expect(ids).toContain(withoutCase.id);
      expect(ids).toContain(cancelledCaseOnly.id);
      expect(ids).not.toContain(withOpenCase.id);
    });

    it('validates pagination and filters', async () => {
      await request(app.getHttpServer())
        .get('/sac-attendances?limit=0')
        .set(authHeader())
        .expect(400);

      await request(app.getHttpServer())
        .get('/sac-attendances?page=0')
        .set(authHeader())
        .expect(400);

      await request(app.getHttpServer())
        .get('/sac-attendances?status=invalid-status')
        .set(authHeader())
        .expect(400);

      await request(app.getHttpServer())
        .get('/sac-attendances?createdFrom=not-a-date')
        .set(authHeader())
        .expect(400);
    });
  });

  describe('GET /sac-attendances/:id', () => {
    it('returns full detail shape', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'conversation-detail',
          status: 'waiting_resolution',
          lastSummary: 'Resumo completo',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .expect(200);

      expectAttendanceDetailShape(response.body, {
        externalConversationId: 'conversation-detail',
        status: 'waiting_resolution',
      });
      expect(response.body.cases).toEqual([]);
      expect(response.body.media).toEqual([]);
      expect(response.body.satisfactionResponse).toBeNull();
    });

    it('404 unknown id', async () => {
      await request(app.getHttpServer())
        .get('/sac-attendances/cmabc123notfound')
        .set(authHeader())
        .expect(404);
    });
  });

  describe('PATCH /sac-attendances/:id', () => {
    it('moves started attendance to collecting_data and stores lastSummary', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-start-collecting',
          status: 'started',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'collecting_data',
          lastSummary: 'Cliente relatou problema inicial e precisa informar loja.',
        })
        .expect(200);

      expect(response.body.status).toBe('collecting_data');
      expect(response.body.lastSummary).toBe(
        'Cliente relatou problema inicial e precisa informar loja.',
      );
    });

    it('cancel from started', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-cancel-started',
          status: 'started',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'cancelled',
          cancellationReason: 'timeout',
        })
        .expect(200);

      expect(response.body.status).toBe('cancelled');
      expect(response.body.cancellationReason).toBe('timeout');
      expect(response.body.closedAt).not.toBeNull();
    });

    it('cancel from collecting_data', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-cancel-collecting',
          status: 'collecting_data',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'cancelled',
          cancellationReason: 'spam',
        })
        .expect(200);
    });

    it('requires cancellationReason', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-cancel-reason-required',
          status: 'started',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'cancelled',
        })
        .expect(400);
    });

    it('rejects invalid cancellationReason', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-cancel-invalid-reason',
          status: 'started',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'cancelled',
          cancellationReason: 'invalid',
        })
        .expect(400);
    });

    it('requires lastSummary when cancellationReason is other', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-cancel-other',
          status: 'started',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'cancelled',
          cancellationReason: 'other',
        })
        .expect(400);
    });

    it.each(['waiting_resolution', 'pesquisa_satisfacao'] as AttendanceStatus[])(
      'rejects cancel from %s',
      async (status) => {
        const attendance = await prisma.attendance.create({
          data: {
            externalConversationId: `patch-cancel-reject-${status}`,
            status,
          },
        });

        await request(app.getHttpServer())
          .patch(`/sac-attendances/${attendance.id}`)
          .set(authHeader())
          .send({
            status: 'cancelled',
            cancellationReason: 'timeout',
          })
          .expect(400);
      },
    );

    it('close without case with orientative category and lastSummary', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-close-without-case',
          status: 'waiting_resolution',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
          detectedCategory: 'INFORMACAO_LOJA',
          lastSummary: 'Orientado e encerrado',
        })
        .expect(200);

      expect(response.body.status).toBe('fechado');
      expect(response.body.detectedCategory).toBe('INFORMACAO_LOJA');
      expect(response.body.lastSummary).toBe('Orientado e encerrado');
      expect(response.body.closedAt).not.toBeNull();
    });

    it('requires detectedCategory on close without case', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-close-missing-category',
          status: 'waiting_resolution',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
          lastSummary: 'Sem categoria',
        })
        .expect(400);
    });

    it('requires lastSummary on close without case', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-close-missing-summary',
          status: 'waiting_resolution',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
          detectedCategory: 'INFORMACAO_LOJA',
        })
        .expect(400);
    });

    it.each([
      'DENUNCIA',
      'MAU_ATENDIMENTO',
      'ESTRUTURA_OPERACAO',
      'PRODUTO_ESTRAGADO',
      'PRODUTO_AVARIA',
      'PRODUTO_EM_FALTA',
      'PRECO_PRODUTO',
    ] as AttendanceCategory[])('rejects category that should generate case: %s', async (category) => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: `patch-close-category-${category}`,
          status: 'waiting_resolution',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
          detectedCategory: category,
          lastSummary: 'Tentativa de fechar',
        })
        .expect(400);
    });

    it('rejects close when attendance has non-cancelled case', async () => {
      const store = await createActiveStore(prisma, '103');
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-close-has-case',
          status: 'waiting_resolution',
        },
      });

      await prisma.sacCase.create({
        data: {
          attendanceId: attendance.id,
          protocol: '202605240005',
          category: 'INFORMACAO_LOJA',
          description: 'Caso ainda ativo',
          status: 'registered',
          storeId: store.id,
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
          detectedCategory: 'INFORMACAO_LOJA',
          lastSummary: 'Tentando fechar mesmo com caso aberto',
        })
        .expect(400);
    });

    it('allows close without satisfaction only from pesquisa_satisfacao', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-close-without-satisfaction-success',
          status: 'pesquisa_satisfacao',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
          closedWithoutSatisfaction: true,
        })
        .expect(200);

      expect(response.body.status).toBe('fechado');
      expect(response.body.closedWithoutSatisfaction).toBe(true);
      expect(response.body.closedAt).not.toBeNull();
      expect(response.body.satisfactionResponse).toBeNull();
    });

    it('requires closedWithoutSatisfaction=true from pesquisa_satisfacao', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-close-without-satisfaction-required-flag',
          status: 'pesquisa_satisfacao',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
        })
        .expect(400);
    });

    it('rejects close without satisfaction outside pesquisa_satisfacao', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          externalConversationId: 'patch-close-without-satisfaction-invalid-from',
          status: 'waiting_resolution',
        },
      });

      await request(app.getHttpServer())
        .patch(`/sac-attendances/${attendance.id}`)
        .set(authHeader())
        .send({
          status: 'fechado',
          closedWithoutSatisfaction: true,
        })
        .expect(400);
    });
  });
});
