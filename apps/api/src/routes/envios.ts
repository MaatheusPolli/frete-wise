import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Shipment } from '../domain/shipment.js';
import { renderZpl } from '../services/label.js';
import type { ShipmentService } from '../services/shipment.service.js';
import { z } from 'zod';
import { CodeParamsSchema, PageQuerySchema, ContractBodySchema, ShipmentResponseSchema, TrackingResponseSchema } from './schemas.js';

const present = (s: Shipment) => ({
  ...s,
  labelUrl: `/envios/${s.trackingCode}/etiqueta`,
  trackingUrl: `/rastreamento/${s.trackingCode}`,
});

export const enviosRoutes =
  (service: ShipmentService): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/envios',
      { schema: { body: ContractBodySchema, response: { 201: ShipmentResponseSchema } } },
      async (req, reply) => {
        const shipment = await service.contract({ ...req.body, correlationId: req.id });
        req.log.info({ trackingCode: shipment.trackingCode, providerId: shipment.providerId }, 'frete contratado');
        return reply.code(201).send(present(shipment));
      },
    );

    app.get(
      '/envios',
      { schema: { querystring: PageQuerySchema, response: { 200: z.object({ total: z.number(), items: z.array(ShipmentResponseSchema) }) } } },
      async (req) => {
        const { total, items } = await service.list(req.query.limit, req.query.offset);
        return { total, items: items.map(present) };
      },
    );

    app.get('/envios/:codigo', { schema: { params: CodeParamsSchema, response: { 200: ShipmentResponseSchema } } }, async (req) =>
      present(await service.get(req.params.codigo)),
    );

    app.get('/envios/:codigo/etiqueta', { schema: { params: CodeParamsSchema } }, async (req, reply) => {
      const shipment = await service.get(req.params.codigo);
      return reply
        .type('application/zpl; charset=utf-8')
        .header('content-disposition', `attachment; filename="etiqueta-${shipment.trackingCode}.zpl"`)
        .send(renderZpl(shipment));
    });

    app.get('/rastreamento/:codigo', { schema: { params: CodeParamsSchema, response: { 200: TrackingResponseSchema } } }, async (req) =>
      service.track(req.params.codigo),
    );
  };
