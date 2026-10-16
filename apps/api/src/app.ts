import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { buildContainer, type Container, type ContainerOverrides } from './container.js';
import { loggerOptions } from './infra/logger.js';
import { cotacoesRoutes } from './routes/cotacoes.js';
import { healthRoutes } from './routes/health.js';
import { provedoresRoutes } from './routes/provedores.js';
import { enviosRoutes } from './routes/envios.js';
import { DomainError } from './domain/errors.js';

export async function buildApp(
  config: Config,
  overrides: ContainerOverrides & { logStream?: NodeJS.WritableStream } = {},
): Promise<{ app: FastifyInstance; container: Container }> {
  const app = Fastify({
    logger: loggerOptions(config.LOG_LEVEL, config.NODE_ENV === 'development', overrides.logStream),
    requestIdHeader: 'x-correlation-id',
    genReqId: () => randomUUID(),
    // Todo log de requisição usa `correlationId` (em vez do `reqId` padrão do Fastify).
    childLoggerFactory: (logger, bindings, opts) => {
      const { reqId, ...rest } = bindings as { reqId?: string };
      return logger.child({ ...rest, correlationId: reqId }, opts);
    },
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-correlation-id', req.id);
    reply.header('access-control-allow-origin', config.CORS_ORIGIN);
  });
  app.options('*', async (_req, reply) => {
    reply
      .header('access-control-allow-methods', 'GET,POST,OPTIONS')
      .header('access-control-allow-headers', 'content-type,x-correlation-id')
      .code(204)
      .send();
  });

  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        correlationId: req.id,
        issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      });
    }
    if (err instanceof DomainError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'OFFER_UNAVAILABLE' ? 422 : 400;
      return reply.code(status).send({ error: err.code, message: err.message, correlationId: req.id });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'erro inesperado');
    return reply.code(status).send({ error: status >= 500 ? 'INTERNAL_ERROR' : (err as Error).message, correlationId: req.id });
  });

  const container = await buildContainer(config, app.log, overrides);
  await app.register(healthRoutes(container.db));
  await app.register(cotacoesRoutes(container.quotationService, container.quotationStore));
  await app.register(provedoresRoutes(container.registry));
  await app.register(enviosRoutes(container.shipmentService));
  app.addHook('onClose', async () => {
    await container.cache.close?.();
    if (container.ownsDb) await container.db.close();
  });
  return { app, container };
}
