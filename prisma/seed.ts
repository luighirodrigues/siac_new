import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stores = [
    {
      internalStoreCode: '001',
      name: 'Peruzzo Centro',
      city: 'Bagé',
      state: 'RS',
      address: 'Rua exemplo, 100',
      active: true,
      aliases: ['centro', 'loja centro'],
    },
    {
      internalStoreCode: '002',
      name: 'Peruzzo Norte',
      city: 'Bagé',
      state: 'RS',
      address: 'Avenida exemplo, 200',
      active: true,
      aliases: ['norte', 'loja norte'],
    },
  ];

  for (const store of stores) {
    await prisma.store.upsert({
      where: { internalStoreCode: store.internalStoreCode },
      update: store,
      create: store,
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
