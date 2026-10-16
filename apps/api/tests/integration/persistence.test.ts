import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { StaticCepResolver } from '../../src/infra/cep-resolver.js';
import { connectPglite, type Database } from '../../src/infra/db/database.js';
import { migrate, MIGRATIONS } from '../../src/infra/db/migrations.js';

const dir = mkdtempSync(join(tmpdir(), 'fretewise-db-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const party = { name: 'Loja Exemplo', street: 'Av. Paulista', number: '1000', city: 'São Paulo' };
const quoteBody = {
  origin: { cep: '01310-100' },
  destination: { cep: '80010-000' },
  items: [{ weightGrams: 1200, lengthCm: 30, widthCm: 20, heightCm: 10, quantity: 1, valueCents: 15_000 }],
};

const start = (extra: Record<string, string> = {}) =>
  buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', PGLITE_DATA_DIR: dir, CACHE_TTL_MS: '60000', ...extra }), {
    cepResolver: new StaticCepResolver(),
  });

describe('persistência em banco (PGlite em disco)', () => {
  it('envios e cotações sobrevivem a reinício da aplicação', async () => {
    let { app } = await start();
    const quote = await app.inject({ method: 'POST', url: '/cotacoes', payload: quoteBody, headers: { 'x-correlation-id': 'q-1' } });
    const cached = await app.inject({ method: 'POST', url: '/cotacoes', payload: quoteBody, headers: { 'x-correlation-id': 'q-2' } });
    expect(cached.json().cached).toBe(true);
    const created = await app.inject({
      method: 'POST', url: '/envios',
      payload: { ...quoteBody, providerId: 'correios', service: 'SEDEX', sender: party, recipient: { ...party, name: 'Maria', complement: 'ap 1' } },
    });
    expect(created.statusCode).toBe(201);
    const code = created.json().trackingCode;
    await app.close();

    ({ app } = await start());
    const got = await app.inject({ method: 'GET', url: `/envios/${code}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({
      trackingCode: code, service: 'SEDEX', recipient: { name: 'Maria', complement: 'ap 1' }, destination: { uf: 'PR' },
      breakdown: { fees: [{ name: 'Ad valorem', value: 75 }] },
    });
    expect((await app.inject({ method: 'GET', url: `/rastreamento/${code}` })).json().status).toBe('POSTADO');

    const hist = (await app.inject({ method: 'GET', url: '/cotacoes?limit=10' })).json();
    // q-1, q-2 e a recotação interna do POST /envios
    expect(hist.total).toBe(3);
    const q1 = (await app.inject({ method: 'GET', url: '/cotacoes/q-1' })).json();
    expect(q1).toMatchObject({ correlationId: 'q-1', originCep: '01310100', destinationCep: '80010000', cached: false });
    expect(q1.offers).toEqual(quote.json().offers);
    expect(q1.cheapestCents).toBe(quote.json().offers[0].price);
    expect((await app.inject({ method: 'GET', url: '/cotacoes/q-2' })).json().cached).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/cotacoes/nao-existe' })).statusCode).toBe(404);

    // nova contratação continua a sequência (não reusa código após reinício)
    const second = await app.inject({
      method: 'POST', url: '/envios',
      payload: { ...quoteBody, providerId: 'correios', service: 'PAC', sender: party, recipient: party },
    });
    expect(second.json().trackingCode).not.toBe(code);

    const list = (await app.inject({ method: 'GET', url: '/envios?limit=1' })).json();
    expect(list.total).toBe(2);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].trackingCode).toBe(second.json().trackingCode);
    expect((await app.inject({ method: 'GET', url: '/envios?limit=1&offset=1' })).json().items[0].trackingCode).toBe(code);
    expect((await app.inject({ method: 'GET', url: '/envios?limit=500' })).statusCode).toBe(400);

    const health = (await app.inject({ method: 'GET', url: '/health' })).json();
    expect(health).toMatchObject({ status: 'ok', database: 'ok', dbKind: 'pglite' });
    await app.close();
  });
});

describe('migrations e resiliência', () => {
  let db: Database;
  afterAll(async () => db?.close());

  it('são idempotentes e versionadas', async () => {
    db = await connectPglite();
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await migrate(db)).toEqual([]);
    const rows = await db.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it('transação faz rollback em erro', async () => {
    await expect(db.transaction(async (tx) => {
      await tx.query("INSERT INTO schema_migrations (version, name) VALUES (999, 'x')");
      throw new Error('falha');
    })).rejects.toThrow('falha');
    expect(await db.query('SELECT 1 FROM schema_migrations WHERE version = 999')).toHaveLength(0);
  });

  it('banco fora do ar: cotação continua (histórico é best-effort) e /health responde 503', async () => {
    const broken = await connectPglite();
    await migrate(broken);
    const { app } = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }), {
      cepResolver: new StaticCepResolver(),
      db: { ...broken, query: async (sql: string, params?: unknown[]) => {
        if (/quotations|SELECT 1$/.test(sql)) throw new Error('db down');
        return broken.query(sql, params);
      } } as Database,
    });
    const res = await app.inject({ method: 'POST', url: '/cotacoes', payload: quoteBody });
    expect(res.statusCode).toBe(200);
    expect(res.json().offers.length).toBeGreaterThan(0);
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(503);
    expect(health.json()).toMatchObject({ status: 'degraded', database: 'down' });
    await app.close();
  });
});
