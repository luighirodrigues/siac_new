import { PrismaService } from '../../src/prisma/prisma.service';

export async function createActiveStore(prisma: PrismaService, code = '001') {
  return prisma.store.create({
    data: {
      internalStoreCode: code,
      name: `Peruzzo ${code}`,
      city: 'Bagé',
      state: 'RS',
      address: `Rua ${code}`,
      operation: 'Segunda a sabado das 8h as 22h; domingo das 9h as 20h',
      active: true,
      aliases: [`loja ${code}`],
    },
  });
}
