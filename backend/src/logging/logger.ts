import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/**
 * One structured logger for the whole backend. In production this emits
 * JSON (ingestible by any log aggregator); in development it's
 * pretty-printed. Never log raw secrets — request logging in
 * api/server.ts redacts Authorization headers and body fields that could
 * contain tokens or passwords.
 */
const options: LoggerOptions = {
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', '*.password', '*.accessToken', '*.refreshToken'],
};

if (env.NODE_ENV !== 'production') {
  options.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
  };
}

export const logger = pino(options);
