import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { sharedTestDb } from '../fixtures/db.js';

const testDb = sharedTestDb();
import { loadConfig } from '../../src/config.js';
import { RedisCache } from '../../src/infra/cache.js';
import { StaticCepResolver } from '../../src/infra/cep-resolver.js';

const EXPRESSO = 'http://expresso.test';
const VIACEP = 'http://viacep.test/ws';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/expresso-response.json', import.meta.url), 'utf8'));

const server = setupServer(
  http.get(`${VIACEP}/:cep/json/`, ({ params }) => {
    const map: Record<string, object> = {
      '01310100': { uf: 'SP', localidade: 'São Paulo' },
      '80010000': { uf: 'PR', localidade: 'Curitiba' },
    };
    const body = map[String(params.cep)];
    return body ? HttpResponse.json(body) : HttpResponse.json({ erro: true });
  }),
  http.post(`${EXPRESSO}/v1/cotacao`, () => HttpResponse.json(fixture)),
);

const config = (over: Record<string, string> = {}) =>
  loadConfig({
    NODE_ENV: 'test', LOG_LEVEL: 'silent', CACHE_TTL_MS: '0', PGLITE_DATA_DIR: 'memory',
    PROVIDER_TIMEOUT_MS: '200', BREAKER_FAILURE_THRESHOLD: '2', BREAKER_RESET_MS: '60000',
    CEP_API_URL: VIACEP, EXPRESSO_API_URL: EXPRESSO, ...over,
  });

const body = (over: object = {}) => ({
  origin: { cep: '01310-100' },
  destination: { cep: '80010-000' },
  items: [{ weightGrams: 1200, lengthCm: 30, widthCm: 20, heightCm: 10, quantity: 1, valueCents: 15_000 }],
  ...over,
});

let app: FastifyInstance;
const start = async (over: Record<string, string> = {}, extra = {}) => {
  ({ app } = await buildApp(config(over), { db: await testDb(), ...extra }));
  return app;
};
const quote = (payload: object = body(), headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/cotacoes', payload, headers });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(async () => {
  server.resetHandlers();
  await app?.close();
});
afterAll(() => server.close());

describe('POST /cotacoes', () => {
  it('agrega todos os provedores, ordena por preço e marca mais barato/rápido', async () => {
    await start();
    const res = await quote(body(), { 'x-correlation-id': 'abc-123' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-correlation-id']).toBe('abc-123');
    const json = res.json();
    expect(json.correlationId).toBe('abc-123');
    expect(json.failures).toEqual([]);
    expect(new Set(json.offers.map((o: { providerId: string }) => o.providerId))).toEqual(new Set(['correios', 'transportadora-sul', 'expresso']));
    const prices = json.offers.map((o: { price: number }) => o.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(json.cheapest).toEqual({ providerId: json.offers[0].providerId, service: json.offers[0].service });
    expect(json.fastest).toEqual({ providerId: 'expresso', service: 'Expresso' });
  });

  it('provedor lento acima do timeout → 200 com resultado parcial', async () => {
    server.use(http.post(`${EXPRESSO}/v1/cotacao`, async () => { await delay(1000); return HttpResponse.json(fixture); }));
    await start();
    const t0 = Date.now();
    const res = await quote();
    expect(Date.now() - t0).toBeLessThan(800);
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.offers.length).toBe(3);
    expect(json.failures).toEqual([{ providerId: 'expresso', code: 'TIMEOUT', reason: 'Timeout após 200ms' }]);
  });

  it('provedor com 500 → 200 com falha reportada', async () => {
    server.use(http.post(`${EXPRESSO}/v1/cotacao`, () => new HttpResponse('boom', { status: 500 })));
    await start();
    const res = await quote();
    expect(res.statusCode).toBe(200);
    expect(res.json().failures[0]).toMatchObject({ providerId: 'expresso', code: 'UPSTREAM_ERROR' });
  });

  it('resposta malformada / não-JSON → INVALID_RESPONSE', async () => {
    server.use(http.post(`${EXPRESSO}/v1/cotacao`, () => HttpResponse.json({ cotacoes: [{ preco: 'abc' }] })));
    await start();
    expect((await quote()).json().failures[0]).toMatchObject({ code: 'INVALID_RESPONSE' });
    server.use(http.post(`${EXPRESSO}/v1/cotacao`, () => HttpResponse.text('<html>')));
    expect((await quote()).json().failures[0]).toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('erro de rede → falha reportada, nunca 500', async () => {
    server.use(http.post(`${EXPRESSO}/v1/cotacao`, () => HttpResponse.error()));
    await start();
    const res = await quote();
    expect(res.statusCode).toBe(200);
    expect(res.json().failures[0]).toMatchObject({ providerId: 'expresso', code: 'UPSTREAM_ERROR' });
  });

  it('breaker abre após N falhas e aparece em GET /provedores', async () => {
    let calls = 0;
    server.use(http.post(`${EXPRESSO}/v1/cotacao`, () => { calls++; return new HttpResponse(null, { status: 503 }); }));
    await start();
    await quote(); await quote();
    const third = (await quote()).json();
    expect(third.failures[0]).toMatchObject({ providerId: 'expresso', code: 'CIRCUIT_OPEN' });
    expect(calls).toBe(2);
    const status = (await app.inject({ method: 'GET', url: '/provedores' })).json();
    expect(status.providers.find((p: { id: string }) => p.id === 'expresso')).toMatchObject({ state: 'open', failures: 3 });
    expect(status.providers.find((p: { id: string }) => p.id === 'correios')).toMatchObject({ state: 'closed' });
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.body).toContain('fretewise_providers_unhealthy 1');
  });

  it('ViaCEP fora do ar → usa faixa de CEP e segue cotando', async () => {
    server.use(http.get(`${VIACEP}/:cep/json/`, () => HttpResponse.error()));
    await start();
    const res = await quote();
    expect(res.statusCode).toBe(200);
    expect(res.json().offers.some((o: { providerId: string }) => o.providerId === 'transportadora-sul')).toBe(true);
  });

  it('todos os provedores falhando → 200 sem ofertas', async () => {
    await start({}, { providers: [{ id: 'x', cubicFactor: 6000, quote: async () => { throw 'string'; } }], cepResolver: new StaticCepResolver() });
    const json = (await quote()).json();
    expect(json.offers).toEqual([]);
    expect(json.failures).toEqual([{ providerId: 'x', code: 'UPSTREAM_ERROR', reason: 'string' }]);
    expect(json.cheapest).toBeUndefined();
  });

  it('cache: segunda cotação igual vem do cache; parciais não são cacheadas', async () => {
    let calls = 0;
    server.use(http.post(`${EXPRESSO}/v1/cotacao`, () => { calls++; return HttpResponse.json(fixture); }));
    await start({ CACHE_TTL_MS: '60000' });
    expect((await quote()).json().cached).toBe(false);
    const second = (await quote()).json();
    expect(second.cached).toBe(true);
    expect(second.offers.length).toBe(5);
    expect(calls).toBe(1);

    server.use(http.post(`${EXPRESSO}/v1/cotacao`, () => new HttpResponse(null, { status: 500 })));
    const other = body({ destination: { cep: '80010-000', uf: 'PR' }, items: [{ weightGrams: 5000, lengthCm: 10, widthCm: 10, heightCm: 10, quantity: 1, valueCents: 1 }] });
    await quote(other);
    expect((await quote(other)).json().cached).toBe(false);
  });

  it('frete grátis acima do limite zera o PAC/Rodoviário', async () => {
    await start({ FREE_SHIPPING_THRESHOLD_CENTS: '10000' });
    const json = (await quote()).json();
    const pac = json.offers.find((o: { service: string }) => o.service === 'PAC');
    expect(pac.price).toBe(0);
    expect(json.offers.find((o: { service: string }) => o.service === 'SEDEX').price).toBeGreaterThan(0);
  });

  it('valida entrada com 400', async () => {
    await start();
    const res = await quote({ origin: { cep: 'abc' }, destination: { cep: '80010000' }, items: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('health, CORS preflight e 404', async () => {
    await start();
    expect((await app.inject({ method: 'GET', url: '/health' })).json().status).toBe('ok');
    const pre = await app.inject({ method: 'OPTIONS', url: '/cotacoes' });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('*');
    expect((await app.inject({ method: 'GET', url: '/nada' })).statusCode).toBe(404);
  });

  it('erro inesperado vira 500 genérico com correlationId', async () => {
    await start({}, { cepResolver: { resolve: async () => { throw new Error('bug'); } } });
    const res = await quote();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'INTERNAL_ERROR' });
  });
});

describe('RedisCache', () => {
  it('degrada silenciosamente quando o Redis está indisponível', async () => {
    const cache = await RedisCache.connect('redis://127.0.0.1:1');
    await cache.set('k', 1, 1000);
    expect(await cache.get('k')).toBeUndefined();
    await cache.set('k', 1, 0);
    await cache.close().catch(() => {});
  });
});
