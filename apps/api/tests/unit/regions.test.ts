import { describe, expect, it } from 'vitest';
import { regionOf, ufFromCep } from '../../src/domain/regions.js';
import { normalizeCep } from '../../src/domain/quote.js';

describe('regiões', () => {
  it('resolve UF por faixa de CEP', () => {
    expect(ufFromCep('01310-100')).toBe('SP');
    expect(ufFromCep('69900000')).toBe('AC');
    expect(ufFromCep('00000000')).toBeUndefined();
  });
  it('região por UF', () => {
    expect(regionOf('sp')).toBe('SE');
    expect(regionOf(undefined)).toBeUndefined();
  });
  it('normaliza CEP', () => {
    expect(normalizeCep('01310-100')).toBe('01310100');
  });
});
