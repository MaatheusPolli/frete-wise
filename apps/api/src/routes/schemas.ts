import { z } from 'zod';

const Cep = z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido (use 00000-000 ou 00000000)');
const Uf = z.string().length(2).toUpperCase().optional();

export const ItemSchema = z.object({
  weightGrams: z.number().int().nonnegative().max(1_000_000),
  lengthCm: z.number().positive().max(500),
  widthCm: z.number().positive().max(500),
  heightCm: z.number().positive().max(500),
  quantity: z.number().int().positive().max(1000).default(1),
  valueCents: z.number().int().nonnegative(),
});

export const QuoteBodySchema = z.object({
  origin: z.object({ cep: Cep, uf: Uf }),
  destination: z.object({ cep: Cep, uf: Uf }),
  items: z.array(ItemSchema).min(1).max(100),
});

const MoneySchema = z.number().int();

export const OfferSchema = z.object({
  providerId: z.string(),
  service: z.string(),
  price: MoneySchema,
  deadlineDays: z.number().int(),
  breakdown: z.object({ base: MoneySchema, fees: z.array(z.object({ name: z.string(), value: MoneySchema })) }),
});

const Pick = z.object({ providerId: z.string(), service: z.string() });

export const QuoteResponseSchema = z.object({
  correlationId: z.string(),
  offers: z.array(OfferSchema),
  failures: z.array(z.object({ providerId: z.string(), code: z.string(), reason: z.string() })),
  cheapest: Pick.optional(),
  fastest: Pick.optional(),
  cached: z.boolean(),
});

export const PartySchema = z.object({
  name: z.string().trim().min(2).max(100),
  document: z.string().trim().max(20).optional(),
  street: z.string().trim().min(1).max(120),
  number: z.string().trim().min(1).max(10),
  complement: z.string().trim().max(60).optional(),
  city: z.string().trim().min(1).max(80),
});

export const ContractBodySchema = QuoteBodySchema.extend({
  providerId: z.string().min(1),
  service: z.string().min(1),
  sender: PartySchema,
  recipient: PartySchema,
});

const AddressOut = z.object({ cep: z.string(), uf: z.string().optional(), city: z.string().optional() });

export const ShipmentResponseSchema = z.object({
  trackingCode: z.string(),
  providerId: z.string(),
  service: z.string(),
  price: MoneySchema,
  deadlineDays: z.number().int(),
  breakdown: OfferSchema.shape.breakdown,
  origin: AddressOut,
  destination: AddressOut,
  sender: PartySchema,
  recipient: PartySchema,
  createdAt: z.string(),
  estimatedDeliveryAt: z.string(),
  labelUrl: z.string(),
  trackingUrl: z.string(),
});

export const TrackingResponseSchema = z.object({
  trackingCode: z.string(),
  providerId: z.string(),
  service: z.string(),
  status: z.enum(['POSTADO', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA', 'ENTREGUE']),
  estimatedDeliveryAt: z.string(),
  events: z.array(z.object({ status: z.string(), description: z.string(), at: z.string() })),
});

export const CodeParamsSchema = z.object({ codigo: z.string().min(1).max(20) });

export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const QuotationRecordSchema = z.object({
  correlationId: z.string(),
  originCep: z.string(),
  destinationCep: z.string(),
  offers: z.array(OfferSchema),
  failures: QuoteResponseSchema.shape.failures,
  cheapestCents: z.number().int().nullable(),
  cached: z.boolean(),
  durationMs: z.number().int(),
  createdAt: z.string(),
});
