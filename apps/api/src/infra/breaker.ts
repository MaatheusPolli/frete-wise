export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerOptions {
  /** falhas consecutivas para abrir */
  failureThreshold: number;
  /** tempo (ms) aberto antes de permitir uma tentativa (meio-aberto) */
  resetTimeoutMs: number;
  now?: () => number;
}

/**
 * Circuit breaker clássico:
 * closed --(N falhas)--> open --(T ms)--> half-open --(sucesso)--> closed
 *                                               \--(falha)--> open
 */
export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;
  private readonly now: () => number;

  constructor(private readonly opts: BreakerOptions) {
    this.now = opts.now ?? Date.now;
  }

  getState(): BreakerState {
    if (this.state === 'open' && this.now() - this.openedAt >= this.opts.resetTimeoutMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  /** true se a chamada pode prosseguir. No meio-aberto permite só uma tentativa por vez. */
  canRequest(): boolean {
    const state = this.getState();
    if (state === 'closed') return true;
    if (state === 'half-open' && !this.trialInFlight) {
      this.trialInFlight = true;
      return true;
    }
    return false;
  }

  onSuccess(): void {
    this.failures = 0;
    this.trialInFlight = false;
    this.state = 'closed';
  }

  onFailure(): void {
    this.trialInFlight = false;
    if (this.state === 'half-open') {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold) this.trip();
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = this.now();
    this.failures = 0;
  }
}
