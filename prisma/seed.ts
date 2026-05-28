import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

type StoreSeed = {
  internalStoreCode: string;
  name: string;
  city: string;
  state: string;
  address: string;
  operation: string | null;
  active: boolean;
  aliases: string[];
};

function parseBoolean(value: string): boolean {
  return ['true', 'verdadeiro', '1', 'sim', 'yes'].includes(value.trim().toLowerCase());
}

function parseAliases(value: string): string[] {
  const normalized = value.trim();

  if (!normalized) {
    return [];
  }

  const jsonLike = normalized.startsWith('{') && normalized.endsWith('}')
    ? normalized.slice(1, -1)
    : normalized;

  const parsed = JSON.parse(jsonLike) as unknown;

  if (!Array.isArray(parsed) || !parsed.every((alias) => typeof alias === 'string')) {
    throw new Error(`Invalid aliases value: ${value}`);
  }

  return parsed;
}

function parseStoresCsv(filePath: string): StoreSeed[] {
  const [headerLine, ...lines] = readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const headers = headerLine.split(';');

  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(';');
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));

      return {
        internalStoreCode: row.internalStoreCode,
        name: row.name,
        city: row.city,
        state: row.state,
        address: row.address,
        operation: row.operation?.trim() || null,
        active: parseBoolean(row.active),
        aliases: parseAliases(row.aliases),
      };
    });
}

async function main() {
  const csvPath = join(__dirname, '..', 'docs', 'planilha_luighi.csv');
  const stores = parseStoresCsv(csvPath);

  for (const store of stores) {
    await prisma.store.upsert({
      where: { internalStoreCode: store.internalStoreCode },
      update: store,
      create: store,
    });
  }

  console.log(`Imported ${stores.length} stores from ${csvPath}`);
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
