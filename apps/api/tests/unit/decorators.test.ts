import { describe, expect, it, vi } from 'vitest';
import { CircuitOpenError, ProviderError, TimeoutError } from '../../src/domain/errors.js';
import { CircuitBreaker } from '../../src/infra/breaker.js';
import { withBreaker } from '../../src/providers/decorators/with-breaker.js';
import { MetricsStore, withMetrics } from '../../src/providers/decorators/with-metrics.js';
import { withTimeout } from '../../src/providers/decorators/with-timeout.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import type { ShippingProvider } from '../../src/providers/types.js';
import { request } from '../fixtures/factories.js';

const fake = (impl: ShippingProvider['quote'], id = 'fake'): ShippingProvider => ({ id, cubicFactor: 6000, quote: impl });

describe('withTimeout', () => {
  it('rejeita com TimeoutError e aborta o sinal', async () => {
    let signal: AbortSignal | undefined;
    const p = withTimeout(fake((_r, ctx) => { signal = ctx?.signal; return new Promise(() => {}); }), 20);
    await expect(p.quote(request())).rejects.toBeInstanceOf(TimeoutError);
    expect(signal?.aborted).toBe(true);
  });
  it('propaga abort do chamador', async () => {
    const parent = new AbortController();
    let signal: AbortSignal | undefined;
    const p = withTimeout(fake(async (_r, ctx) => { signal = ctx?.signal; return []; }), 1000);
    await p.quote(request(), { signal: parent.signal });
    const p2 = withTimeout(fake((_r, ctx) => { signal = ctx?.signal; return new Promise(() => {}); }), 50);
    const pending = p2.quote(request(), { signal: parent.signal });
    parent.abort();
    expect(signal?.aborted).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('withBreaker', () => {
  it('abre após falhas e passa a recusar sem chamar o provider', async () => {
    const impl = vi.fn(async () => { throw new Error('boom'); });
    const p = withBreaker(fake(impl), new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 }));
    await expect(p.quote(request())).rejects.toThrow('boom');
    await expect(p.quote(request())).rejects.toThrow('boom');
    await expect(p.quote(request())).rejects.toBeInstanceOf(CircuitOpenError);
    expect(impl).toHaveBeenCalledTimes(2);
  });
  it('rota não atendida não conta como falha', async () => {
    const b = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const p = withBreaker(fake(async () => { throw new ProviderError('fake', 'x', 'UNSUPPORTED_ROUTE'); }), b);
    await expect(p.quote(request())).rejects.toThrow();
    expect(b.getState()).toBe('closed');
  });
});

describe('withMetrics / registry', () => {
  it('registra chamadas, falhas e latência; exporta prometheus', async () => {
    const store = new MetricsStore();
    const ok = withMetrics(fake(async () => []), store);
    const ko = withMetrics(fake(async () => { throw new Error('x'); }, 'ko'), store);
    await ok.quote(request()); await ok.quote(request());
    await expect(ko.quote(request())).rejects.toThrow();
    expect(store.get('fake').calls).toBe(2);
    expect(store.get('ko').failures).toBe(1);
    expect(store.get('nada').calls).toBe(0);
    expect(store.toPrometheus({ extra_metric: 1 })).toContain('fretewise_provider_calls_total{provider="fake"} 2');
  });
  it('registry recusa id duplicado e expõe status', async () => {
    const r = new ProviderRegistry({ timeoutMs: 100, breaker: { failureThreshold: 1, resetTimeoutMs: 1000 } });
    r.register(fake(async () => { throw new Error('x'); }));
    expect(() => r.register(fake(async () => []))).toThrow(/duplicado/);
    await expect(r.list()[0]!.quote(request())).rejects.toThrow();
    expect(r.status()[0]).toMatchObject({ id: 'fake', state: 'open', calls: 1, failures: 1 });
  });
});
