import { Prisma } from '@prisma/client';

export function isUniqueConstraintError(
  error: unknown,
  fields?: string[],
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  if (!fields?.length) {
    return true;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return fields.every((field) => target.includes(field));
  }

  if (typeof target === 'string') {
    return fields.every((field) => target.includes(field));
  }

  return false;
}
