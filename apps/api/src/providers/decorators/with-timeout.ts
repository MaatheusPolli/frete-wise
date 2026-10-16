import { TimeoutError } from '../../domain/errors.js';
import type { ProviderContext, ShippingProvider } from '../types.js';

/** Aborta a chamada (AbortController) e rejeita com TimeoutError após `ms`. */
export function withTimeout(provider: ShippingProvider, ms: number): ShippingProvider {
  return {
    id: provider.id,
    cubicFactor: provider.cubicFactor,
    async quote(req, ctx: ProviderContext = {}) {
      const controller = new AbortController();
      const onParentAbort = () => controller.abort(ctx.signal?.reason);
      ctx.signal?.addEventListener('abort', onParentAbort, { once: true });
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new TimeoutError(provider.id, ms));
        }, ms);
      });
      try {
        return await Promise.race([provider.quote(req, { ...ctx, signal: controller.signal }), timeout]);
      } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener('abort', onParentAbort);
      }
    },
  };
}
