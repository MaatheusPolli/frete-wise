import type { FastifyBaseLogger } from 'fastify';

export type Logger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error' | 'debug' | 'child'>;

export function loggerOptions(level: string, pretty: boolean, stream?: NodeJS.WritableStream) {
  return {
    level,
    ...(stream ? { stream } : {}),
    ...(pretty && !stream ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } } : {}),
    redact: ['req.headers.authorization'],
  };
}
