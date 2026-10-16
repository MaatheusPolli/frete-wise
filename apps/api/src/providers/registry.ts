import { CircuitBreaker, type BreakerOptions } from '../infra/breaker.js';
import { withBreaker } from './decorators/with-breaker.js';
import { MetricsStore, withMetrics } from './decorators/with-metrics.js';
import { withTimeout } from './decorators/with-timeout.js';
import type { ShippingProvider } from './types.js';

export interface RegistryOptions {
  timeoutMs: number;
  breaker: BreakerOptions;
}

export interface ProviderStatus {
  id: string;
  state: ReturnType<CircuitBreaker['getState']>;
  avgLatencyMs: number;
  calls: number;
  failures: number;
}

/**
 * Único ponto de registro: todo provider recebe timeout + breaker + métricas por decorator,
 * então é impossível adicionar um provedor "desprotegido".
 * Ordem: metrics( breaker( timeout( provider ) ) ) — timeout conta como falha no breaker
 * e chamadas barradas pelo breaker aparecem nas métricas.
 */
export class ProviderRegistry {
  readonly metrics = new MetricsStore();
  private readonly entries = new Map<string, { provider: ShippingProvider; breaker: CircuitBreaker }>();

  constructor(private readonly opts: RegistryOptions) {}

  register(provider: ShippingProvider, overrides: Partial<RegistryOptions> = {}): this {
    if (this.entries.has(provider.id)) throw new Error(`Provider duplicado: ${provider.id}`);
    const breaker = new CircuitBreaker({ ...this.opts.breaker, ...overrides.breaker });
    const wrapped = withMetrics(withBreaker(withTimeout(provider, overrides.timeoutMs ?? this.opts.timeoutMs), breaker), this.metrics);
    this.entries.set(provider.id, { provider: wrapped, breaker });
    return this;
  }

  list(): ShippingProvider[] {
    return [...this.entries.values()].map((e) => e.provider);
  }

  status(): ProviderStatus[] {
    return [...this.entries.entries()].map(([id, e]) => {
      const m = this.metrics.get(id);
      return { id, state: e.breaker.getState(), avgLatencyMs: m.avgLatencyMs, calls: m.calls, failures: m.failures };
    });
  }
}
