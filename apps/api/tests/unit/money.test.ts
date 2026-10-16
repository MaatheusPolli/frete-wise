import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/money.js';

describe('Money', () => {
  it('rejeita valores não inteiros', () => {
    expect(() => Money.ofCents(10.5)).toThrow(RangeError);
  });
  it('converte reais sem erro de float', () => {
    expect(Money.fromReais(0.1 + 0.2)).toBe(30);
    expect(Money.fromReais(1.005)).toBe(101);
    expect(Money.fromReais(19.9)).toBe(1990);
    expect(() => Money.fromReais(Number.NaN)).toThrow();
  });
  it('soma e subtrai em centavos', () => {
    expect(Money.add(Money.ofCents(10), Money.ofCents(20), Money.ofCents(3))).toBe(33);
    expect(Money.add()).toBe(0);
    expect(Money.subtract(Money.ofCents(100), Money.ofCents(1))).toBe(99);
  });
  it('multiplica e aplica percentual com arredondamento half-up', () => {
    expect(Money.multiply(Money.ofCents(333), 1.1)).toBe(366);
    expect(Money.percentBps(Money.ofCents(1999), 50)).toBe(10); // 9,995 -> 10
    expect(Money.percentBps(Money.ofCents(1000), 1500)).toBe(150);
  });
  it('max, zero e format', () => {
    expect(Money.max(Money.ofCents(1), Money.ofCents(2))).toBe(2);
    expect(Money.max(Money.ofCents(3), Money.ofCents(2))).toBe(3);
    expect(Money.zero()).toBe(0);
    expect(Money.format(Money.ofCents(123456789))).toBe('R$ 1.234.567,89');
    expect(Money.format(Money.ofCents(-5))).toBe('-R$ 0,05');
  });
});
