import { PrismaService } from '../../src/prisma/prisma.service';

export async function resetDatabase(prisma: PrismaService) {
  await prisma.satisfactionResponse.deleteMany();
  await prisma.media.deleteMany();
  await prisma.sacCase.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.protocolSequence.deleteMany();
  await prisma.store.deleteMany();
}
