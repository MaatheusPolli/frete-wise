import { Money } from '../domain/money.js';
import { billableWeightGrams } from '../domain/package.js';
import type { Offer, QuoteRequest } from '../domain/quote.js';
import { regionOf, type Region } from '../domain/regions.js';
import { ProviderError } from '../domain/errors.js';
import type { ShippingProvider } from './types.js';

interface ServiceTable {
  service: string;
  /** preço base em centavos até 1 kg */
  baseCents: number;
  /** adicional por kg (ou fração) acima de 1 kg */
  perKgCents: number;
  baseDays: number;
  maxWeightGrams: number;
}

/** Tabela simulada — valores ilustrativos. */
const SERVICES: ServiceTable[] = [
  { service: 'PAC', baseCents: 2190, perKgCents: 450, baseDays: 6, maxWeightGrams: 30_000 },
  { service: 'SEDEX', baseCents: 3490, perKgCents: 890, baseDays: 2, maxWeightGrams: 30_000 },
];

/** multiplicador (bps) e dias extras conforme distância entre regiões */
function routeModifier(from: Region | undefined, to: Region | undefined): { bps: number; days: number } {
  if (!from || !to) return { bps: 15_000, days: 3 };
  if (from === to) return { bps: 10_000, days: 0 };
  const far = new Set(['N-S', 'S-N', 'N-SE', 'SE-N', 'NE-S', 'S-NE']);
  return far.has(`${from}-${to}`) ? { bps: 14_000, days: 3 } : { bps: 12_000, days: 1 };
}

export class CorreiosProvider implements ShippingProvider {
  readonly id = 'correios';
  readonly cubicFactor = 6000;

  async quote(req: QuoteRequest): Promise<Offer[]> {
    const weight = billableWeightGrams(req.items, this.cubicFactor);
    const mod = routeModifier(regionOf(req.origin.uf), regionOf(req.destination.uf));
    const offers = SERVICES.filter((s) => weight <= s.maxWeightGrams).map((s) => {
      const extraKg = Math.max(0, Math.ceil((weight - 1000) / 1000));
      const base = Money.percentBps(Money.ofCents(s.baseCents + extraKg * s.perKgCents), mod.bps);
      return {
        providerId: this.id,
        service: s.service,
        price: base,
        deadlineDays: s.baseDays + mod.days,
        breakdown: { base, fees: [] },
      };
    });
    if (offers.length === 0) throw new ProviderError(this.id, 'Peso acima do limite dos Correios', 'UNSUPPORTED_ROUTE');
    return offers;
  }
}
