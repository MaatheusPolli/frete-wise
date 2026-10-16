import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  BREAKER_RESET_MS: z.coerce.number().int().positive().default(30_000),
  CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(300_000),
  REDIS_URL: z.string().url().optional(),
  CEP_API_URL: z.string().url().default('https://viacep.com.br/ws'),
  CEP_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  EXPRESSO_API_URL: z.string().url().optional(),
  FREE_SHIPPING_THRESHOLD_CENTS: z.coerce.number().int().nonnegative().default(50_000),
  /** duração simulada de 1 dia no rastreamento (ms); reduza para demos */
  TRACKING_DAY_MS: z.coerce.number().int().positive().default(86_400_000),
  /** PostgreSQL (produção). Sem ela, usa Postgres embutido (PGlite). */
  DATABASE_URL: z.string().url().optional(),
  /** Diretório de dados do PGlite; 'memory' = sem persistência (testes). */
  PGLITE_DATA_DIR: z.string().default('./data/pgdata'),
  CORS_ORIGIN: z.string().default('*'),
});

export type Config = z.infer<typeof EnvSchema>;

/** Falha rápido no boot se o ambiente estiver inválido. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  return parsed.data;
}
