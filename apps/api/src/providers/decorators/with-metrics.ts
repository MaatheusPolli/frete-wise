import type { ShippingProvider } from '../types.js';

export interface ProviderStats {
  calls: number;
  failures: number;
  /** média móvel exponencial (ms) */
  avgLatencyMs: number;
  lastLatencyMs: number;
}

export class MetricsStore {
  private readonly stats = new Map<string, ProviderStats>();

  record(providerId: string, latencyMs: number, ok: boolean): void {
    const s = this.stats.get(providerId) ?? { calls: 0, failures: 0, avgLatencyMs: 0, lastLatencyMs: 0 };
    s.calls += 1;
    if (!ok) s.failures += 1;
    s.lastLatencyMs = latencyMs;
    s.avgLatencyMs = s.calls === 1 ? latencyMs : Math.round(s.avgLatencyMs * 0.8 + latencyMs * 0.2);
    this.stats.set(providerId, s);
  }

  get(providerId: string): ProviderStats {
    return this.stats.get(providerId) ?? { calls: 0, failures: 0, avgLatencyMs: 0, lastLatencyMs: 0 };
  }

  /** formato de exposição Prometheus */
  toPrometheus(extra: Record<string, number> = {}): string {
    const lines: string[] = [
      '# TYPE fretewise_provider_calls_total counter',
      '# TYPE fretewise_provider_failures_total counter',
      '# TYPE fretewise_provider_latency_avg_ms gauge',
    ];
    for (const [id, s] of this.stats) {
      lines.push(`fretewise_provider_calls_total{provider="${id}"} ${s.calls}`);
      lines.push(`fretewise_provider_failures_total{provider="${id}"} ${s.failures}`);
      lines.push(`fretewise_provider_latency_avg_ms{provider="${id}"} ${s.avgLatencyMs}`);
    }
    for (const [name, value] of Object.entries(extra)) lines.push(`${name} ${value}`);
    return lines.join('\n') + '\n';
  }
}

export function withMetrics(provider: ShippingProvider, store: MetricsStore): ShippingProvider {
  return {
    id: provider.id,
    cubicFactor: provider.cubicFactor,
    async quote(req, ctx) {
      const start = performance.now();
      try {
        const offers = await provider.quote(req, ctx);
        store.record(provider.id, Math.round(performance.now() - start), true);
        return offers;
      } catch (err) {
        store.record(provider.id, Math.round(performance.now() - start), false);
        throw err;
      }
    },
  };
}
