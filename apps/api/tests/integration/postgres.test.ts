/**
 * Roda contra um PostgreSQL real quando TEST_DATABASE_URL existe (no CI há um serviço postgres).
 * Garante que o mesmo SQL/migrations funciona no driver `pg`, não só no PGlite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { StaticCepResolver } from '../../src/infra/cep-resolver.js';
import { connectPostgres, type Database } from '../../src/infra/db/database.js';
import { migrate } from '../../src/infra/db/migrations.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgreSQL real (driver pg)', () => {
  let db: Database;

  beforeAll(async () => {
    db = await connectPostgres(url!);
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');
  });
  afterAll(async () => db?.close());

  it('aplica migrations, transaciona e faz rollback', async () => {
    expect((await migrate(db)).length).toBeGreaterThan(0);
    expect(await migrate(db)).toEqual([]);
    await expect(db.transaction(async (tx) => {
      await tx.query("INSERT INTO schema_migrations (version, name) VALUES (999, 'x')");
      throw new Error('falha');
    })).rejects.toThrow('falha');
    expect(await db.query('SELECT 1 FROM schema_migrations WHERE version = 999')).toHaveLength(0);
    await db.transaction((tx) => tx.query("INSERT INTO schema_migrations (version, name) VALUES (998, 'ok')"));
    await db.query('DELETE FROM schema_migrations WHERE version = 998');
  });

  it('fluxo completo: cotação → contratação → rastreamento → histórico, persistindo no Postgres', async () => {
    const { app } = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: url! }), {
      cepResolver: new StaticCepResolver(),
    });
    const party = { name: 'Loja', street: 'Rua A', number: '1', city: 'São Paulo' };
    const body = {
      origin: { cep: '01310100' }, destination: { cep: '80010000' },
      items: [{ weightGrams: 1000, lengthCm: 10, widthCm: 10, heightCm: 10, quantity: 1, valueCents: 1000 }],
    };
    const created = await app.inject({ method: 'POST', url: '/envios', payload: { ...body, providerId: 'correios', service: 'PAC', sender: party, recipient: party } });
    expect(created.statusCode).toBe(201);
    const code = created.json().trackingCode;
    expect((await app.inject({ method: 'GET', url: `/envios/${code}` })).json().price).toBe(created.json().price);
    expect((await app.inject({ method: 'GET', url: `/rastreamento/${code}` })).json().status).toBe('POSTADO');
    expect((await app.inject({ method: 'GET', url: '/envios' })).json().total).toBe(1);
    const hist = (await app.inject({ method: 'GET', url: '/cotacoes' })).json();
    expect(hist.total).toBe(1);
    expect(typeof hist.items[0].cheapestCents).toBe('number');
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toMatchObject({ database: 'ok', dbKind: 'postgres' });
    await app.close();
  });
});
