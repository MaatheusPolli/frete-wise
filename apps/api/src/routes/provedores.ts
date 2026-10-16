import type { FastifyPluginAsync } from 'fastify';
import type { ProviderRegistry } from '../providers/registry.js';

export const provedoresRoutes =
  (registry: ProviderRegistry): FastifyPluginAsync =>
  async (app) => {
    app.get('/provedores', async () => ({ providers: registry.status() }));
    app.get('/metrics', async (_req, reply) => {
      const open = registry.status().filter((s) => s.state !== 'closed').length;
      reply.type('text/plain; version=0.0.4');
      return registry.metrics.toPrometheus({ fretewise_providers_unhealthy: open });
    });
  };
