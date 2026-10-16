import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/money.js';
import type { Offer } from '../../src/domain/quote.js';
import {
  adValorem, applyRules, buildContext, defaultRules, extraDaysByUf, freeShippingAbove, regionFee,
} from '../../src/services/pricing-rules.js';
import { item, request } from '../fixtures/factories.js';

const offer = (price = 2000, service = 'PAC'): Offer => ({
  providerId: 'p', service, price: Money.ofCents(price), deadlineDays: 3, breakdown: { base: Money.ofCents(price), fees: [] },
});

describe('regras de precificação', () => {
  it('taxa por região aplica bps e registra no breakdown', () => {
    const ctx = buildContext(request({ destination: { cep: '69000000', uf: 'AM' } }));
    const out = regionFee({ N: 1500 })(offer(), ctx);
    expect(out.price).toBe(2300);
    expect(out.breakdown.fees).toEqual([{ name: 'Taxa região N', value: 300 }]);
    expect(regionFee({ NE: 1000 })(offer(), ctx)).toEqual(offer());
  });
  it('região desconhecida não aplica taxa', () => {
    const ctx = buildContext(request({ destination: { cep: '00000000' } }));
    expect(regionFee({ N: 1500 })(offer(), ctx)).toEqual(offer());
  });
  it('ad valorem respeita mínimo', () => {
    const ctx = buildContext(request({ items: [item({ valueCents: 10_000 })] }));
    expect(adValorem(50)(offer(), ctx).price).toBe(2050);
    expect(adValorem(50, 200)(offer(), ctx).price).toBe(2200);
    expect(adValorem(0)(offer(), ctx).breakdown.fees).toEqual([]);
  });
  it('prazo adicional por UF', () => {
    const ctx = buildContext(request({ destination: { cep: '69000000', uf: 'AM' } }));
    expect(extraDaysByUf({ AM: 3 })(offer(), ctx).deadlineDays).toBe(6);
    expect(extraDaysByUf({ RR: 3 })(offer(), ctx).deadlineDays).toBe(3);
    const semUf = buildContext(request({ destination: { cep: '00000000' } }));
    expect(extraDaysByUf({ AM: 3 })(offer(), semUf).deadlineDays).toBe(3);
  });
  it('frete grátis acima do limite, só para serviços elegíveis', () => {
    const ctx = buildContext(request({ items: [item({ valueCents: 60_000 })] }));
    const out = freeShippingAbove(50_000, ['PAC'])(offer(), ctx);
    expect(out.price).toBe(0);
    expect(out.breakdown.fees.at(-1)).toEqual({ name: 'Frete grátis', value: -2000 });
    expect(freeShippingAbove(50_000, ['PAC'])(offer(2000, 'SEDEX'), ctx).price).toBe(2000);
    expect(freeShippingAbove(50_000)(offer(2000, 'SEDEX'), ctx).price).toBe(0);
    expect(freeShippingAbove(0)(offer(), ctx).price).toBe(2000);
    const barato = buildContext(request({ items: [item({ valueCents: 100 })] }));
    expect(freeShippingAbove(50_000)(offer(), barato).price).toBe(2000);
  });
  it('pipeline aplica em ordem via reduce', () => {
    const ctx = buildContext(request({ destination: { cep: '69000000', uf: 'AM' }, items: [item({ valueCents: 10_000 })] }));
    const out = applyRules(offer(), defaultRules(50_000), ctx);
    // 2000 + 50 (ad valorem) = 2050; +15% = 307,5 -> 308 => 2358
    expect(out.price).toBe(2358);
    expect(out.deadlineDays).toBe(6);
  });
});
