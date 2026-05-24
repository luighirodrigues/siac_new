import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from '../helpers/app';
import { authHeader } from '../helpers/auth';
import { resetDatabase } from '../helpers/database';
import { createActiveStore } from '../helpers/fixtures';

jest.setTimeout(30000);

describe('GET /stores (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('requires token', async () => {
    await request(app.getHttpServer()).get('/stores').expect(401);
  });

  it('returns only active stores', async () => {
    await createActiveStore(prisma, '001');
    await createActiveStore(prisma, '002');
    await prisma.store.create({
      data: {
        internalStoreCode: '003',
        name: 'Peruzzo Inativa',
        city: 'Bagé',
        state: 'RS',
        address: 'Rua 003',
        active: false,
        aliases: ['inativa'],
      },
    });

    const response = await request(app.getHttpServer())
      .get('/stores')
      .set(authHeader())
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body.every((store: { active: boolean }) => store.active)).toBe(true);
    expect(response.body.map((store: { internalStoreCode: string }) => store.internalStoreCode)).toEqual([
      '001',
      '002',
    ]);
  });

  it('returns all active stores without pagination', async () => {
    for (let index = 1; index <= 25; index += 1) {
      await createActiveStore(prisma, String(index).padStart(3, '0'));
    }

    const response = await request(app.getHttpServer())
      .get('/stores')
      .set(authHeader())
      .expect(200);

    expect(response.body).toHaveLength(25);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('includes id, internalStoreCode, name, city, state, address, active, aliases', async () => {
    const store = await createActiveStore(prisma, '001');

    const response = await request(app.getHttpServer())
      .get('/stores')
      .set(authHeader())
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual({
      id: store.id,
      internalStoreCode: '001',
      name: 'Peruzzo 001',
      city: 'Bagé',
      state: 'RS',
      address: 'Rua 001',
      active: true,
      aliases: ['loja 001'],
    });
  });
});
