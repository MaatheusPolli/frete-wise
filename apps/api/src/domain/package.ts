import { ValidationError } from './errors.js';

export interface Item {
  /** peso real em gramas */
  weightGrams: number;
  /** dimensões em centímetros */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  quantity: number;
  /** valor declarado em centavos */
  valueCents: number;
}

/**
 * Peso cubado (kg) = (C x L x A em cm) / fator.
 * Fatores comuns: 6000 (Correios / aéreo) ou 300 kg/m³ rodoviário (equivale a 3333,33 em cm³/kg).
 * Aceitamos o fator no formato "cm³ por kg" (6000) ou "kg por m³" (300) — valores < 1000 são tratados como kg/m³.
 */
export function cubicWeightGrams(item: Pick<Item, 'lengthCm' | 'widthCm' | 'heightCm'>, factor: number): number {
  if (factor <= 0) throw new ValidationError('Fator de cubagem deve ser positivo');
  const volumeCm3 = item.lengthCm * item.widthCm * item.heightCm;
  const kg = factor < 1000 ? (volumeCm3 / 1_000_000) * factor : volumeCm3 / factor;
  return Math.ceil(kg * 1000);
}

/** Peso tarifável = max(peso real, peso cubado), somado por item x quantidade. */
export function billableWeightGrams(items: Item[], factor: number): number {
  return items.reduce((acc, item) => {
    const real = item.weightGrams;
    const cubic = cubicWeightGrams(item, factor);
    return acc + Math.max(real, cubic) * item.quantity;
  }, 0);
}

export function totalValueCents(items: Item[]): number {
  return items.reduce((acc, i) => acc + i.valueCents * i.quantity, 0);
}

export function realWeightGrams(items: Item[]): number {
  return items.reduce((acc, i) => acc + i.weightGrams * i.quantity, 0);
}
