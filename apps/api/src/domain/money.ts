/**
 * Dinheiro sempre em centavos (inteiro). Nunca float.
 */
export type Money = number & { readonly __brand: 'Money' };

function assertInt(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money deve ser inteiro em centavos, recebido: ${value}`);
  }
}

export const Money = {
  ofCents(cents: number): Money {
    assertInt(cents);
    return cents as Money;
  },
  /** Converte reais (ex.: 12.34) em centavos com arredondamento half-up explícito. */
  fromReais(reais: number): Money {
    if (!Number.isFinite(reais)) throw new RangeError(`Valor inválido: ${reais}`);
    // toFixed evita 1.005*100 = 100.49999
    const cents = Math.round(Number((reais * 100).toFixed(4)));
    return Money.ofCents(cents);
  },
  zero(): Money {
    return 0 as Money;
  },
  add(...values: Money[]): Money {
    return Money.ofCents(values.reduce<number>((acc, v) => acc + v, 0));
  },
  subtract(a: Money, b: Money): Money {
    return Money.ofCents(a - b);
  },
  /** Multiplica por fator (ex.: 1.1 para +10%) arredondando half-up para centavo. */
  multiply(value: Money, factor: number): Money {
    return Money.ofCents(Math.round(Number((value * factor).toFixed(4))));
  },
  /** Percentual em basis points (1% = 100 bps) para evitar floats na configuração. */
  percentBps(value: Money, bps: number): Money {
    return Money.ofCents(Math.round((value * bps) / 10_000));
  },
  max(a: Money, b: Money): Money {
    return (a >= b ? a : b) as Money;
  },
  format(value: Money): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const cents = (abs % 100).toString().padStart(2, '0');
    return `${sign}R$ ${reais},${cents}`;
  },
};
