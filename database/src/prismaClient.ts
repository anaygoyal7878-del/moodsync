import { PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient instance shared by every workspace that needs DB
 * access (backend API, workers). Re-instantiating PrismaClient per request
 * exhausts Postgres connections under load — this module-level singleton
 * pattern is Prisma's own documented recommendation for long-running
 * Node processes. Kept in its own file (rather than directly in index.ts)
 * so repository modules can import it without going through the package's
 * public barrel, avoiding a circular import.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'query'],
});
