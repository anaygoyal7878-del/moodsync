import { buildServer } from './api/server.js';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';

async function main() {
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`MoodSync backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main();
