import { afterAll } from 'vitest';
import { connectPglite, type Database } from '../../src/infra/db/database.js';

/** Um PGlite em memória por arquivo de teste (iniciar o WASM custa ~1-2 s). */
export function sharedTestDb(): () => Promise<Database> {
  let db: Promise<Database> | undefined;
  afterAll(async () => (await db)?.close());
  return () => (db ??= connectPglite());
}
