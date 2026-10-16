import type { Money } from './money.js';
import type { Item } from './package.js';

export type UF = string;

export interface Address {
  cep: string;
  uf?: UF;
  city?: string;
}

export interface QuoteRequest {
  origin: Address;
  destination: Address;
  items: Item[];
  correlationId: string;
}

export interface Fee {
  name: string;
  value: Money;
}

export interface Offer {
  providerId: string;
  service: string;
  price: Money;
  deadlineDays: number;
  breakdown: { base: Money; fees: Fee[] };
}

export interface ProviderFailure {
  providerId: string;
  code: string;
  reason: string;
}

export interface QuotationResult {
  correlationId: string;
  offers: Offer[];
  failures: ProviderFailure[];
  cheapest?: { providerId: string; service: string };
  fastest?: { providerId: string; service: string };
  cached: boolean;
}

export function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, '');
}
