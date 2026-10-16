export class DomainError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

/** Erros de provedor nunca viram 500 — são reportados em `failures`. */
export class ProviderError extends DomainError {
  constructor(
    readonly providerId: string,
    message: string,
    code: 'TIMEOUT' | 'CIRCUIT_OPEN' | 'UPSTREAM_ERROR' | 'INVALID_RESPONSE' | 'UNSUPPORTED_ROUTE' = 'UPSTREAM_ERROR',
  ) {
    super(message, code);
  }
}

export class TimeoutError extends ProviderError {
  constructor(providerId: string, ms: number) {
    super(providerId, `Timeout após ${ms}ms`, 'TIMEOUT');
  }
}

export class CircuitOpenError extends ProviderError {
  constructor(providerId: string) {
    super(providerId, 'Circuit breaker aberto', 'CIRCUIT_OPEN');
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
  }
}
