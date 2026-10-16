import { z } from 'zod';
import { Money } from '../domain/money.js';
import { billableWeightGrams, totalValueCents } from '../domain/package.js';
import type { Offer, QuoteRequest } from '../domain/quote.js';
import { ProviderError } from '../domain/errors.js';
import { fetchJson, HttpError } from '../infra/http.js';
import type { ProviderContext, ShippingProvider } from './types.js';

/** Contrato bruto da API externa (em reais, formato próprio). */
export const ExpressoResponseSchema = z.object({
  cotacoes: z.array(
    z.object({
      modalidade: z.string(),
      valor: z.number().nonnegative(),
      prazo_uteis: z.number().int().nonnegative(),
      taxas: z.array(z.object({ descricao: z.string(), valor: z.number() })).default([]),
    }),
  ),
});

export function mapExpressoResponse(providerId: string, raw: unknown): Offer[] {
  const parsed = ExpressoResponseSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError(providerId, 'Resposta malformada do provedor', 'INVALID_RESPONSE');
  return parsed.data.cotacoes.map((c) => {
    const fees = c.taxas.map((t) => ({ name: t.descricao, value: Money.fromReais(t.valor) }));
    const price = Money.fromReais(c.valor);
    const base = Money.subtract(price, Money.add(...fees.map((f) => f.value)));
    return { providerId, service: c.modalidade, price, deadlineDays: c.prazo_uteis, breakdown: { base, fees } };
  });
}

/** Transportadora com API HTTP real (usada com mock MSW nos testes). */
export class ExpressoHttpProvider implements ShippingProvider {
  readonly id = 'expresso';
  readonly cubicFactor = 6000;

  constructor(private readonly baseUrl: string) {}

  async quote(req: QuoteRequest, ctx: ProviderContext = {}): Promise<Offer[]> {
    const body = {
      cep_origem: req.origin.cep,
      cep_destino: req.destination.cep,
      peso_kg: billableWeightGrams(req.items, this.cubicFactor) / 1000,
      valor_declarado: totalValueCents(req.items) / 100,
    };
    let raw: unknown;
    try {
      raw = await fetchJson(`${this.baseUrl}/v1/cotacao`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'x-correlation-id': req.correlationId },
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
    } catch (err) {
      if (err instanceof HttpError) throw new ProviderError(this.id, err.message, err.status === 200 ? 'INVALID_RESPONSE' : 'UPSTREAM_ERROR');
      throw err;
    }
    return mapExpressoResponse(this.id, raw);
  }
}
