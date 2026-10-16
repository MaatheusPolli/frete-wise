import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import { MemoryCache, RedisCache, type Cache } from './infra/cache.js';
import { ViaCepResolver, type CepResolver } from './infra/cep-resolver.js';
import type { Logger } from './infra/logger.js';
import { CorreiosProvider } from './providers/correios.provider.js';
import { CsvTableProvider } from './providers/csv-table.provider.js';
import { ExpressoHttpProvider } from './providers/expresso-http.provider.js';
import { ProviderRegistry } from './providers/registry.js';
import type { ShippingProvider } from './providers/types.js';
import { defaultRules, type PricingRule } from './services/pricing-rules.js';
import { QuotationService } from './services/quotation.service.js';
import { ShipmentService } from './services/shipment.service.js';
import { PgShipmentStore, type ShipmentStore } from './infra/shipment-store.js';
import { PgQuotationStore, type QuotationStore } from './infra/quotation-store.js';
import { connectPglite, connectPostgres, type Database } from './infra/db/database.js';
import { migrate } from './infra/db/migrations.js';

export interface Container {
  registry: ProviderRegistry;
  quotationService: QuotationService;
  shipmentService: ShipmentService;
  quotationStore: QuotationStore;
  cache: Cache;
  db: Database;
  /** true quando o container abriu o banco (e portanto deve fechá-lo) */
  ownsDb: boolean;
}

export interface ContainerOverrides {
  providers?: ShippingProvider[];
  cache?: Cache;
  cepResolver?: CepResolver;
  rules?: PricingRule[];
  shipmentStore?: ShipmentStore;
  db?: Database;
  now?: () => number;
}

export const CSV_TABLE_PATH = fileURLToPath(new URL('../data/transportadora-sul.csv', import.meta.url));

export function defaultProviders(config: Config): ShippingProvider[] {
  const providers: ShippingProvider[] = [new CorreiosProvider(), CsvTableProvider.fromFile('transportadora-sul', CSV_TABLE_PATH)];
  if (config.EXPRESSO_API_URL) providers.push(new ExpressoHttpProvider(config.EXPRESSO_API_URL));
  return providers;
}

export async function buildContainer(config: Config, logger: Logger, overrides: ContainerOverrides = {}): Promise<Container> {
  const registry = new ProviderRegistry({
    timeoutMs: config.PROVIDER_TIMEOUT_MS,
    breaker: { failureThreshold: config.BREAKER_FAILURE_THRESHOLD, resetTimeoutMs: config.BREAKER_RESET_MS },
  });
  for (const p of overrides.providers ?? defaultProviders(config)) registry.register(p);

  const db = overrides.db ?? (await openDatabase(config));
  const applied = await migrate(db);
  if (applied.length) logger.info({ applied, kind: db.kind }, 'migrations aplicadas');
  const quotationStore = new PgQuotationStore(db);

  const cache = overrides.cache ?? (config.REDIS_URL ? await RedisCache.connect(config.REDIS_URL) : new MemoryCache());
  const quotationService = new QuotationService({
    registry,
    rules: overrides.rules ?? defaultRules(config.FREE_SHIPPING_THRESHOLD_CENTS),
    cache,
    cacheTtlMs: config.CACHE_TTL_MS,
    cepResolver: overrides.cepResolver ?? new ViaCepResolver(config.CEP_API_URL, config.CEP_TIMEOUT_MS),
    logger,
    history: quotationStore,
  });
  const shipmentService = new ShipmentService(quotationService, overrides.shipmentStore ?? new PgShipmentStore(db), {
    trackingDayMs: config.TRACKING_DAY_MS,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  return { registry, quotationService, shipmentService, quotationStore, cache, db, ownsDb: !overrides.db };
}

export async function openDatabase(config: Config): Promise<Database> {
  if (config.DATABASE_URL) return connectPostgres(config.DATABASE_URL);
  return connectPglite(config.PGLITE_DATA_DIR === 'memory' ? undefined : config.PGLITE_DATA_DIR);
}
