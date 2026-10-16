import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../infra/db/database.js';

export const healthRoutes =
  (db: Database): FastifyPluginAsync =>
  async (app) => {
    app.get('/health', async (_req, reply) => {
      let database: 'ok' | 'down' = 'ok';
      try {
        await db.query('SELECT 1');
      } catch {
        database = 'down';
      }
      return reply
        .code(database === 'ok' ? 200 : 503)
        .send({ status: database === 'ok' ? 'ok' : 'degraded', database, dbKind: db.kind, uptimeSeconds: Math.round(process.uptime()) });
    });
  };
