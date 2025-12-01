import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var anomalyPrisma: PrismaClient | undefined;
}

export const prisma =
  global.anomalyPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.anomalyPrisma = prisma;
}
