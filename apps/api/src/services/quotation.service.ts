import { randomUUID } from 'node:crypto';
import { ProviderError } from '../domain/errors.js';
import { billableWeightGrams, realWeightGrams } from '../domain/package.js';
import type { Offer, ProviderFailure, QuotationResult, QuoteRequest } from '../domain/quote.js';
import { normalizeCep } from '../domain/quote.js';
import type { Cache } from '../infra/cache.js';
import type { CepResolver } from '../infra/cep-resolver.js';
import type { Logger } from '../infra/logger.js';
import type { QuotationStore } from '../infra/quotation-store.js';
import type { ProviderRegistry } from '../providers/registry.js';
import { applyRules, buildContext, type PricingRule } from './pricing-rules.js';

export interface QuotationDeps {
  registry: ProviderRegistry;
  rules: PricingRule[];
  cache: Cache;
  cacheTtlMs: number;
  cepResolver: CepResolver;
  logger: Logger;
  history?: QuotationStore;
}

export type QuoteInput = Omit<QuoteRequest, 'correlationId'> & { correlationId?: string };

/** Peso arredondado para faixas de 100 g na chave de cache. */
export function cacheKey(req: QuoteRequest): string {
  const weight = Math.ceil(Math.max(realWeightGrams(req.items), billableWeightGrams(req.items, 6000)) / 100) * 100;
  const value = req.items.reduce((a, i) => a + i.valueCents * i.quantity, 0);
  return `quote:${req.origin.cep}:${req.destination.cep}:${weight}:${value}`;
}

export function sortOffers(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.price - b.price || a.deadlineDays - b.deadlineDays || a.providerId.localeCompare(b.providerId));
}

function toFailure(providerId: string, reason: unknown): ProviderFailure {
  if (reason instanceof ProviderError) return { providerId, code: reason.code, reason: reason.message };
  const message = reason instanceof Error ? reason.message : String(reason);
  return { providerId, code: 'UPSTREAM_ERROR', reason: message };
}

export class QuotationService {
  constructor(private readonly deps: QuotationDeps) {}

  /** Resolve CEP → endereço com UF (usa a mesma integração ViaCEP com fallback). */
  async resolveCep(cep: string) {
    return this.deps.cepResolver.resolve(cep);
  }

  async quote(input: QuoteInput): Promise<QuotationResult> {
    const startedAt = performance.now();
    const correlationId = input.correlationId ?? randomUUID();
    const log = this.deps.logger.child({ correlationId });

    const [origin, destination] = await Promise.all([
      this.deps.cepResolver.resolve(input.origin.cep),
      this.deps.cepResolver.resolve(input.destination.cep),
    ]);
    const request: QuoteRequest = {
      origin: { ...origin, uf: input.origin.uf ?? origin.uf, cep: normalizeCep(input.origin.cep) },
      destination: { ...destination, uf: input.destination.uf ?? destination.uf, cep: normalizeCep(input.destination.cep) },
      items: input.items,
      correlationId,
    };

    const key = cacheKey(request);
    const cached = await this.deps.cache.get<Omit<QuotationResult, 'correlationId' | 'cached'>>(key);
    if (cached) {
      log.info({ key }, 'cotação servida do cache');
      const fromCache = { ...cached, correlationId, cached: true };
      await this.saveHistory(request, fromCache, startedAt, log);
      return fromCache;
    }

    const providers = this.deps.registry.list();
    const settled = await Promise.allSettled(providers.map((p) => p.quote(request, { logger: log })));

    const offers: Offer[] = [];
    const failures: ProviderFailure[] = [];
    const ctx = buildContext(request);
    settled.forEach((res, idx) => {
      const providerId = providers[idx]!.id;
      if (res.status === 'fulfilled') {
        log.info({ providerId, offers: res.value.length }, 'provider respondeu');
        offers.push(...res.value.map((o) => applyRules(o, this.deps.rules, ctx)));
      } else {
        const failure = toFailure(providerId, res.reason);
        log.warn({ providerId, code: failure.code, reason: failure.reason }, 'provider falhou');
        failures.push(failure);
      }
    });

    const sorted = sortOffers(offers);
    const fastest = [...sorted].sort((a, b) => a.deadlineDays - b.deadlineDays || a.price - b.price)[0];
    const cheapest = sorted[0];
    const result: QuotationResult = {
      correlationId,
      offers: sorted,
      failures,
      ...(cheapest ? { cheapest: { providerId: cheapest.providerId, service: cheapest.service } } : {}),
      ...(fastest ? { fastest: { providerId: fastest.providerId, service: fastest.service } } : {}),
      cached: false,
    };

    // Só cacheia resultados completos: um resultado parcial não deve "congelar" a falha.
    if (failures.every((f) => f.code === 'UNSUPPORTED_ROUTE') && sorted.length > 0) {
      const { correlationId: _c, cached: _k, ...toCache } = result;
      await this.deps.cache.set(key, toCache, this.deps.cacheTtlMs);
    }
    log.info({ offers: sorted.length, failures: failures.length }, 'cotação concluída');
    await this.saveHistory(request, result, startedAt, log);
    return result;
  }

  /** Histórico é best-effort: falha no banco nunca derruba a cotação. */
  private async saveHistory(req: QuoteRequest, result: QuotationResult, startedAt: number, log: Logger): Promise<void> {
    if (!this.deps.history) return;
    try {
      await this.deps.history.record(req, result, performance.now() - startedAt);
    } catch (err) {
      log.warn({ err }, 'falha ao gravar histórico de cotação');
    }
  }
}
