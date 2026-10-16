import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../../src/infra/breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 });

  it('abre após N falhas consecutivas', () => {
    const b = make();
    b.onFailure(); b.onFailure();
    expect(b.getState()).toBe('closed');
    expect(b.consecutiveFailures).toBe(2);
    b.onFailure();
    expect(b.getState()).toBe('open');
    expect(b.canRequest()).toBe(false);
  });

  it('sucesso zera o contador', () => {
    const b = make();
    b.onFailure(); b.onFailure(); b.onSuccess(); b.onFailure(); b.onFailure();
    expect(b.getState()).toBe('closed');
  });

  it('vira meio-aberto após T e permite só uma tentativa', () => {
    const b = make();
    b.onFailure(); b.onFailure(); b.onFailure();
    vi.advanceTimersByTime(9_999);
    expect(b.getState()).toBe('open');
    vi.advanceTimersByTime(1);
    expect(b.getState()).toBe('half-open');
    expect(b.canRequest()).toBe(true);
    expect(b.canRequest()).toBe(false);
  });

  it('meio-aberto: sucesso fecha, falha reabre', () => {
    const b = make();
    b.onFailure(); b.onFailure(); b.onFailure();
    vi.advanceTimersByTime(10_000);
    b.canRequest();
    b.onFailure();
    expect(b.getState()).toBe('open');
    vi.advanceTimersByTime(10_000);
    b.canRequest();
    b.onSuccess();
    expect(b.getState()).toBe('closed');
    expect(b.canRequest()).toBe(true);
  });
});
