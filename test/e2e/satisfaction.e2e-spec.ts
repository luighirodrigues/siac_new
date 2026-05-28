import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AttendanceStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { authHeader } from '../helpers/auth';
import { resetDatabase } from '../helpers/database';
import { configureTestEnvironment } from '../helpers/environment';

jest.setTimeout(30000);

type TestApp = {
  app: INestApplication;
  prisma: PrismaService;
};

async function createSatisfactionTestApp(): Promise<TestApp> {
  configureTestEnvironment();

  const modulePath = '../../src/satisfaction/satisfaction.module';
  const { SatisfactionModule } = (await import(modulePath)) as {
    SatisfactionModule: unknown;
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, SatisfactionModule as never],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

async function createAttendanceInSatisfaction(
  prisma: PrismaService,
  externalConversationId?: string,
) {
  return prisma.attendance.create({
    data: {
      externalConversationId:
        externalConversationId ??
        `conversation-${Math.random().toString(36).slice(2, 10)}`,
      status: 'pesquisa_satisfacao',
      satisfactionRequestedAt: new Date(),
    },
  });
}

const validPayload = {
  problemResolvedByCustomer: true,
  rating: 5,
};

describe('SAC Satisfaction Response (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createSatisfactionTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe('POST /sac-attendances/:attendanceId/satisfaction-response', () => {
    it('requires token', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .send(validPayload)
        .expect(401);
    });

    it.each([
      'started',
      'collecting_data',
      'waiting_resolution',
      'fechado',
      'cancelled',
    ] as AttendanceStatus[])(
      'accepts only from Attendance in pesquisa_satisfacao (rejects %s)',
      async (status) => {
        const attendance = await prisma.attendance.create({
          data: {
            externalConversationId: `conversation-invalid-${status}`,
            status,
          },
        });

        await request(app.getHttpServer())
          .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
          .set(authHeader())
          .send(validPayload)
          .expect(400);
      },
    );

    it.each([0, 6, -1])('requires rating between 1 and 5 (rejects %s)', async (rating) => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send({
          ...validPayload,
          rating,
        })
        .expect(400);
    });

    it('requires problemResolvedByCustomer', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send({
          rating: 4,
        })
        .expect(400);
    });

    it('accepts optional comment', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      const response = await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send({
          ...validPayload,
          comment: 'Atendimento excelente',
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          attendanceId: attendance.id,
          problemResolvedByCustomer: true,
          rating: 5,
          comment: 'Atendimento excelente',
        }),
      );
    });

    it('creates one response', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      const response = await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send(validPayload)
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          attendanceId: attendance.id,
          problemResolvedByCustomer: true,
          rating: 5,
          comment: null,
        }),
      );

      const responses = await prisma.satisfactionResponse.findMany({
        where: { attendanceId: attendance.id },
      });
      expect(responses).toHaveLength(1);
    });

    it('duplicate response returns 409', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send(validPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send({
          problemResolvedByCustomer: false,
          rating: 2,
        })
        .expect(409);
    });

    it('fills satisfactionRespondedAt', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send(validPayload)
        .expect(201);

      const updatedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(updatedAttendance.satisfactionRespondedAt).not.toBeNull();
    });

    it('closes Attendance with status fechado', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send(validPayload)
        .expect(201);

      const updatedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(updatedAttendance.status).toBe('fechado');
    });

    it('fills closedAt', async () => {
      const attendance = await createAttendanceInSatisfaction(prisma);

      await request(app.getHttpServer())
        .post(`/sac-attendances/${attendance.id}/satisfaction-response`)
        .set(authHeader())
        .send(validPayload)
        .expect(201);

      const updatedAttendance = await prisma.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
      });
      expect(updatedAttendance.closedAt).not.toBeNull();
    });
  });
});
