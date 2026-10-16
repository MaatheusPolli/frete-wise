import type { Offer, QuoteRequest } from '../domain/quote.js';
import type { Logger } from '../infra/logger.js';

export interface ProviderContext {
  signal?: AbortSignal;
  logger?: Logger;
}

export interface ShippingProvider {
  readonly id: string;
  /** fator de cubagem do provedor (cm³/kg ou kg/m³) */
  readonly cubicFactor: number;
  quote(req: QuoteRequest, ctx?: ProviderContext): Promise<Offer[]>;
}
