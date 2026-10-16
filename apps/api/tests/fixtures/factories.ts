import type { Item } from '../../src/domain/package.js';
import type { QuoteRequest } from '../../src/domain/quote.js';

export const item = (over: Partial<Item> = {}): Item => ({
  weightGrams: 1000, lengthCm: 20, widthCm: 15, heightCm: 10, quantity: 1, valueCents: 10_000, ...over,
});

export const request = (over: Partial<QuoteRequest> = {}): QuoteRequest => ({
  origin: { cep: '01310100', uf: 'SP' },
  destination: { cep: '80010000', uf: 'PR' },
  items: [item()],
  correlationId: 'test-corr',
  ...over,
});

export const silentLogger = {
  info() {}, warn() {}, error() {}, debug() {},
  child() { return silentLogger; },
} as never;
