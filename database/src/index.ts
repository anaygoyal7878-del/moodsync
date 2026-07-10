import { PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient instance shared by every workspace that needs DB
 * access (backend API, workers). Re-instantiating PrismaClient per request
 * exhausts Postgres connections under load — this module-level singleton
 * pattern is Prisma's own documented recommendation for long-running
 * Node processes.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'query'],
});

export * from '@prisma/client';
