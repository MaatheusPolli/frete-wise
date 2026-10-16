export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Executa `fn` numa transação (BEGIN/COMMIT, ROLLBACK em erro). */
  transaction<T>(fn: (tx: Pick<Database, 'query'>) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: 'postgres' | 'pglite';
}

/** PostgreSQL real (produção / docker-compose). */
export async function connectPostgres(url: string): Promise<Database> {
  const { default: pg } = await import('pg');
  // BIGINT (int8) como number: centavos e sequências cabem em Number.MAX_SAFE_INTEGER
  pg.types.setTypeParser(20, (v: string) => Number(v));
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  await pool.query('select 1');
  return {
    kind: 'postgres',
    async query(sql, params = []) {
      return (await pool.query(sql, params)).rows;
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({ query: async (sql, params = []) => (await client.query(sql, params)).rows });
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Postgres embutido (WASM) — dev local sem Docker e testes.
 * `dataDir` persiste em disco; omitido = memória.
 */
export async function connectPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  const q = async <T>(runner: { query: typeof db.query }, sql: string, params: unknown[] = []) =>
    (await runner.query<T>(sql, params)).rows.map(normalizeRow) as T[];
  return {
    kind: 'pglite',
    query: (sql, params) => q(db, sql, params),
    transaction: (fn) => db.transaction((tx) => fn({ query: (sql, params) => q(tx as never, sql, params) })),
    close: () => db.close(),
  };
}

/** PGlite devolve BIGINT como bigint — alinhamos com o driver `pg` (number). */
function normalizeRow<T>(row: T): T {
  if (row && typeof row === 'object') {
    for (const [k, v] of Object.entries(row)) if (typeof v === 'bigint') (row as Record<string, unknown>)[k] = Number(v);
  }
  return row;
}
