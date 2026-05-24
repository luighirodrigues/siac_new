import { PrismaService } from '../prisma/prisma.service';
import { ProtocolService } from './protocol.service';

const TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/siac_new_test?schema=public';

describe('ProtocolService', () => {
  let prisma: PrismaService;
  let service: ProtocolService;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ProtocolService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.protocolSequence.deleteMany();
  });

  it('formats protocol as SAC-YYYYMMDD-000001', async () => {
    const now = new Date('2026-05-24T15:00:00.000Z');

    const protocol = await service.generateProtocol({ now });

    expect(protocol).toMatch(/^SAC-\d{8}-\d{6}$/);
    expect(protocol).toBe('SAC-20260524-000001');
  });

  it('uses America/Sao_Paulo timezone for the date key', async () => {
    // 2026-01-02T02:30:00Z is still 2026-01-01 23:30 in Sao Paulo (UTC-3)
    const now = new Date('2026-01-02T02:30:00.000Z');

    const protocol = await service.generateProtocol({ now });

    expect(protocol).toBe('SAC-20260101-000001');
  });

  it('increments sequence per local day', async () => {
    const now = new Date('2026-05-24T12:00:00.000Z');

    const first = await service.generateProtocol({ now });
    const second = await service.generateProtocol({ now });
    const third = await service.generateProtocol({ now });

    expect(first).toBe('SAC-20260524-000001');
    expect(second).toBe('SAC-20260524-000002');
    expect(third).toBe('SAC-20260524-000003');
  });

  it('resets sequence when the local day changes', async () => {
    const dayOne = new Date('2026-05-24T12:00:00.000Z');
    const dayTwo = new Date('2026-05-25T12:00:00.000Z');

    await service.generateProtocol({ now: dayOne });
    await service.generateProtocol({ now: dayOne });
    const nextDay = await service.generateProtocol({ now: dayTwo });

    expect(nextDay).toBe('SAC-20260525-000001');
  });

  it('allows gaps in sequence but never duplicates', async () => {
    const now = new Date('2026-05-24T12:00:00.000Z');
    await service.generateProtocol({ now });

    await prisma.protocolSequence.update({
      where: { protocolDate: '20260524' },
      data: { lastSequence: 10 },
    });

    const afterGap = await service.generateProtocol({ now });
    const next = await service.generateProtocol({ now });

    expect(afterGap).toBe('SAC-20260524-000011');
    expect(next).toBe('SAC-20260524-000012');
  });

  it('generates globally unique protocol values under concurrency', async () => {
    const now = new Date('2026-05-24T12:00:00.000Z');
    const count = 25;

    const protocols = await Promise.all(
      Array.from({ length: count }, () => service.generateProtocol({ now })),
    );

    expect(new Set(protocols).size).toBe(count);
    protocols.forEach((protocol: string) => {
      expect(protocol).toMatch(/^SAC-20260524-\d{6}$/);
    });
  });
});
