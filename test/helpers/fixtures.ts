import { PrismaService } from '../../src/prisma/prisma.service';

export async function createActiveStore(prisma: PrismaService, code = '001') {
  return prisma.store.create({
    data: {
      internalStoreCode: code,
      name: `Peruzzo ${code}`,
      city: 'Bagé',
      state: 'RS',
      address: `Rua ${code}`,
      active: true,
      aliases: [`loja ${code}`],
    },
  });
}
