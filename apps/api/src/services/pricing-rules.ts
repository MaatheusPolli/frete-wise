import { Money } from '../domain/money.js';
import type { Offer, QuoteRequest } from '../domain/quote.js';
import { regionOf, type Region } from '../domain/regions.js';
import { totalValueCents } from '../domain/package.js';

export interface RuleContext {
  request: QuoteRequest;
  orderValue: Money;
}

/** Regra = função pura (offer, ctx) => offer. Aplicadas em pipeline via reduce. */
export type PricingRule = (offer: Offer, ctx: RuleContext) => Offer;

function addFee(offer: Offer, name: string, value: Money): Offer {
  if (value === 0) return offer;
  return {
    ...offer,
    price: Money.add(offer.price, value),
    breakdown: { ...offer.breakdown, fees: [...offer.breakdown.fees, { name, value }] },
  };
}

/** Taxa extra (em bps sobre o preço) por região de destino. */
export function regionFee(bpsByRegion: Partial<Record<Region, number>>): PricingRule {
  return (offer, ctx) => {
    const region = regionOf(ctx.request.destination.uf);
    const bps = region ? bpsByRegion[region] : undefined;
    return bps ? addFee(offer, `Taxa região ${region}`, Money.percentBps(offer.price, bps)) : offer;
  };
}

/** Ad valorem: percentual (bps) sobre o valor declarado, com mínimo. */
export function adValorem(bps: number, minCents = 0): PricingRule {
  return (offer, ctx) => addFee(offer, 'Ad valorem', Money.max(Money.percentBps(ctx.orderValue, bps), Money.ofCents(minCents)));
}

/** Prazo adicional por UF de destino. */
export function extraDaysByUf(daysByUf: Record<string, number>): PricingRule {
  return (offer, ctx) => {
    const extra = daysByUf[ctx.request.destination.uf?.toUpperCase() ?? ''] ?? 0;
    return extra ? { ...offer, deadlineDays: offer.deadlineDays + extra } : offer;
  };
}

/**
 * Frete grátis acima de X (valor do pedido). Aplicado por último: zera o preço
 * registrando um desconto no breakdown para manter rastreabilidade.
 * `services` restringe a quais serviços se aplica (ex.: só o mais econômico).
 */
export function freeShippingAbove(thresholdCents: number, services?: string[]): PricingRule {
  return (offer, ctx) => {
    if (thresholdCents <= 0 || ctx.orderValue < thresholdCents) return offer;
    if (services && !services.includes(offer.service)) return offer;
    return addFee(offer, 'Frete grátis', Money.ofCents(-offer.price));
  };
}

export function applyRules(offer: Offer, rules: PricingRule[], ctx: RuleContext): Offer {
  return rules.reduce((acc, rule) => rule(acc, ctx), offer);
}

export function buildContext(request: QuoteRequest): RuleContext {
  return { request, orderValue: Money.ofCents(totalValueCents(request.items)) };
}

export function defaultRules(freeShippingThresholdCents: number): PricingRule[] {
  return [
    adValorem(50, 0), // 0,5% do valor declarado
    regionFee({ N: 1500, NE: 800 }), // +15% Norte, +8% Nordeste (dificuldade de acesso)
    extraDaysByUf({ AM: 3, RR: 3, AP: 3, AC: 2, RO: 2, PA: 1 }),
    freeShippingAbove(freeShippingThresholdCents, ['PAC', 'Rodoviário', 'Econômico']),
  ];
}
