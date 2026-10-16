import { CircuitOpenError, ProviderError } from '../../domain/errors.js';
import type { CircuitBreaker } from '../../infra/breaker.js';
import type { ShippingProvider } from '../types.js';

/**
 * Envolve o provider com circuit breaker. Erros de "rota não atendida" são respostas
 * legítimas de negócio e não contam como falha de saúde do provedor.
 */
export function withBreaker(provider: ShippingProvider, breaker: CircuitBreaker): ShippingProvider {
  return {
    id: provider.id,
    cubicFactor: provider.cubicFactor,
    async quote(req, ctx) {
      if (!breaker.canRequest()) throw new CircuitOpenError(provider.id);
      try {
        const offers = await provider.quote(req, ctx);
        breaker.onSuccess();
        return offers;
      } catch (err) {
        if (err instanceof ProviderError && err.code === 'UNSUPPORTED_ROUTE') breaker.onSuccess();
        else breaker.onFailure();
        throw err;
      }
    },
  };
}
