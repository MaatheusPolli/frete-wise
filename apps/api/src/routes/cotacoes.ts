import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError } from '../domain/errors.js';
import type { QuotationStore } from '../infra/quotation-store.js';
import type { QuotationService } from '../services/quotation.service.js';
import { PageQuerySchema, QuotationRecordSchema, QuoteBodySchema, QuoteResponseSchema } from './schemas.js';

export const cotacoesRoutes =
  (service: QuotationService, history: QuotationStore): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/cotacoes',
      { schema: { body: QuoteBodySchema, response: { 200: QuoteResponseSchema } } },
      async (req) => {
        const { origin, destination, items } = req.body;
        return service.quote({
          origin: { cep: origin.cep, ...(origin.uf ? { uf: origin.uf } : {}) },
          destination: { cep: destination.cep, ...(destination.uf ? { uf: destination.uf } : {}) },
          items,
          correlationId: req.id,
        });
      },
    );

    app.get(
      '/cotacoes',
      { schema: { querystring: PageQuerySchema, response: { 200: z.object({ total: z.number(), items: z.array(QuotationRecordSchema) }) } } },
      async (req) => history.list(req.query),
    );

    app.get(
      '/cotacoes/:correlationId',
      { schema: { params: z.object({ correlationId: z.string().min(1).max(100) }), response: { 200: QuotationRecordSchema } } },
      async (req) => {
        const rec = await history.get(req.params.correlationId);
        if (!rec) throw new NotFoundError(`Cotação ${req.params.correlationId} não encontrada`);
        return rec;
      },
    );
  };
