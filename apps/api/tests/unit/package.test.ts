import { describe, expect, it } from 'vitest';
import { billableWeightGrams, cubicWeightGrams, realWeightGrams, totalValueCents } from '../../src/domain/package.js';
import { item } from '../fixtures/factories.js';

describe('peso cubado', () => {
  it('fator 6000 (cm³/kg)', () => {
    // 60x40x30 = 72000 cm³ / 6000 = 12 kg
    expect(cubicWeightGrams({ lengthCm: 60, widthCm: 40, heightCm: 30 }, 6000)).toBe(12_000);
  });
  it('fator 300 (kg/m³)', () => {
    // 0,072 m³ * 300 = 21,6 kg
    expect(cubicWeightGrams({ lengthCm: 60, widthCm: 40, heightCm: 30 }, 300)).toBe(21_600);
  });
  it('fator inválido', () => {
    expect(() => cubicWeightGrams({ lengthCm: 1, widthCm: 1, heightCm: 1 }, 0)).toThrow();
  });
  it('usa o maior entre real e cubado, por quantidade', () => {
    const leve = item({ weightGrams: 500, lengthCm: 60, widthCm: 40, heightCm: 30, quantity: 2 });
    expect(billableWeightGrams([leve], 6000)).toBe(24_000);
    const pesado = item({ weightGrams: 20_000, lengthCm: 10, widthCm: 10, heightCm: 10 });
    expect(billableWeightGrams([pesado], 6000)).toBe(20_000);
  });
  it('peso zero usa o cubado', () => {
    expect(billableWeightGrams([item({ weightGrams: 0, lengthCm: 1, widthCm: 1, heightCm: 1 })], 6000)).toBe(1);
  });
  it('volume enorme não perde precisão', () => {
    const w = billableWeightGrams([item({ weightGrams: 1, lengthCm: 500, widthCm: 500, heightCm: 500 })], 6000);
    expect(w).toBe(20_833_334);
  });
  it('totais de valor e peso real', () => {
    const items = [item({ valueCents: 100, weightGrams: 10, quantity: 3 }), item({ valueCents: 5, weightGrams: 1 })];
    expect(totalValueCents(items)).toBe(305);
    expect(realWeightGrams(items)).toBe(31);
  });
});
