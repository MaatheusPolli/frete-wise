import type { Database } from './database.js';

/** Migrations versionadas, aplicadas em ordem e registradas em schema_migrations. Nunca edite uma já publicada. */
export const MIGRATIONS: Array<{ version: number; name: string; sql: string }> = [
  {
    version: 1,
    name: 'shipments',
    sql: `
      CREATE SEQUENCE IF NOT EXISTS shipment_seq START 1;
      CREATE TABLE shipments (
        tracking_code          TEXT PRIMARY KEY,
        provider_id            TEXT NOT NULL,
        service                TEXT NOT NULL,
        price_cents            BIGINT NOT NULL,
        deadline_days          INTEGER NOT NULL,
        breakdown              JSONB NOT NULL,
        origin                 JSONB NOT NULL,
        destination            JSONB NOT NULL,
        sender                 JSONB NOT NULL,
        recipient              JSONB NOT NULL,
        items                  JSONB NOT NULL,
        correlation_id         TEXT NOT NULL,
        created_at             TIMESTAMPTZ NOT NULL,
        estimated_delivery_at  TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX shipments_created_at_idx ON shipments (created_at DESC);
      CREATE INDEX shipments_provider_idx ON shipments (provider_id);
    `,
  },
  {
    version: 2,
    name: 'quotations',
    sql: `
      CREATE TABLE quotations (
        correlation_id    TEXT PRIMARY KEY,
        origin_cep        TEXT NOT NULL,
        destination_cep   TEXT NOT NULL,
        request           JSONB NOT NULL,
        offers            JSONB NOT NULL,
        failures          JSONB NOT NULL,
        cheapest_cents    BIGINT,
        cached            BOOLEAN NOT NULL,
        duration_ms       INTEGER NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX quotations_created_at_idx ON quotations (created_at DESC);
    `,
  },
];

export async function migrate(db: Database): Promise<number[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.transaction(async (tx) => {
      for (const stmt of m.sql.split(';').map((s) => s.trim()).filter(Boolean)) await tx.query(stmt);
      await tx.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
    });
    applied.push(m.version);
  }
  return applied;
}
