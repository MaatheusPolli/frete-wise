import type { ProviderStatus, QuotationResult } from '../src/api';

export const result = (over: Partial<QuotationResult> = {}): QuotationResult => ({
  correlationId: '12345678-aaaa-bbbb-cccc-000000000000',
  offers: [
    { providerId: 'transportadora-sul', service: 'Rodoviário', price: 2365, deadlineDays: 3,
      breakdown: { base: 2290, fees: [{ name: 'Ad valorem', value: 75 }] } },
    { providerId: 'correios', service: 'SEDEX', price: 5331, deadlineDays: 1, breakdown: { base: 5331, fees: [] } },
    { providerId: 'correios', service: 'PAC', price: 0, deadlineDays: 7, breakdown: { base: 3168, fees: [] } },
  ],
  failures: [],
  cheapest: { providerId: 'transportadora-sul', service: 'Rodoviário' },
  fastest: { providerId: 'correios', service: 'SEDEX' },
  cached: false,
  ...over,
});

export const providers: ProviderStatus[] = [
  { id: 'correios', state: 'closed', avgLatencyMs: 7, calls: 3, failures: 0 },
  { id: 'expresso', state: 'open', avgLatencyMs: 3000, calls: 5, failures: 5 },
  { id: 'csv', state: 'half-open', avgLatencyMs: 2, calls: 1, failures: 1 },
];

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const shipment = {
  trackingCode: 'OB000000015BR', providerId: 'correios', service: 'PAC', price: 3243, deadlineDays: 7,
  estimatedDeliveryAt: '2026-01-12T12:00:00.000Z',
  labelUrl: '/envios/OB000000015BR/etiqueta', trackingUrl: '/rastreamento/OB000000015BR',
};

export const tracking = {
  trackingCode: 'OB000000015BR', providerId: 'correios', service: 'PAC', status: 'EM_TRANSITO' as const,
  estimatedDeliveryAt: '2026-01-12T12:00:00.000Z',
  events: [
    { status: 'EM_TRANSITO', description: 'Objeto em trânsito', at: '2026-01-07T12:00:00.000Z' },
    { status: 'POSTADO', description: 'Objeto postado', at: '2026-01-05T12:00:00.000Z' },
  ],
};
