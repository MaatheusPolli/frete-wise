import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { sharedTestDb } from '../fixtures/db.js';

const testDb = sharedTestDb();
import { loadConfig } from '../../src/config.js';
import { StaticCepResolver } from '../../src/infra/cep-resolver.js';

const DAY = 1000;
let now = Date.parse('2026-01-05T12:00:00Z');
let app: FastifyInstance;

const party = { name: 'Loja Exemplo', street: 'Av. Paulista', number: '1000', city: 'São Paulo' };
const body = (over: object = {}) => ({
  providerId: 'correios',
  service: 'PAC',
  origin: { cep: '01310-100' },
  destination: { cep: '80010-000' },
  items: [{ weightGrams: 1200, lengthCm: 30, widthCm: 20, heightCm: 10, quantity: 1, valueCents: 15_000 }],
  sender: party,
  recipient: { ...party, name: 'Maria Cliente', city: 'Curitiba' },
  ...over,
});

async function start() {
  ({ app } = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', PGLITE_DATA_DIR: 'memory', TRACKING_DAY_MS: String(DAY) }), {
    cepResolver: new StaticCepResolver(),
    now: () => now,
    db: await testDb(),
  }));
}

afterEach(async () => {
  await app?.close();
});

describe('contratação e rastreamento', () => {
  it('contrata com o preço recotado no servidor e gera etiqueta', async () => {
    await start();
    const quote = (await app.inject({ method: 'POST', url: '/cotacoes', payload: body() })).json();
    const pac = quote.offers.find((o: { service: string }) => o.service === 'PAC');

    const res = await app.inject({ method: 'POST', url: '/envios', payload: { ...body(), price: 1 } });
    expect(res.statusCode).toBe(201);
    const shipment = res.json();
    expect(shipment.trackingCode).toMatch(/^OB\d{9}BR$/);
    expect(shipment.price).toBe(pac.price); // ignora preço enviado pelo cliente
    expect(shipment.destination).toMatchObject({ cep: '80010000', uf: 'PR' });
    expect(shipment.labelUrl).toBe(`/envios/${shipment.trackingCode}/etiqueta`);

    const got = await app.inject({ method: 'GET', url: `/envios/${shipment.trackingCode.toLowerCase()}` });
    expect(got.json().trackingCode).toBe(shipment.trackingCode);

    const label = await app.inject({ method: 'GET', url: shipment.labelUrl });
    expect(label.statusCode).toBe(200);
    expect(label.headers['content-type']).toContain('application/zpl');
    expect(label.headers['content-disposition']).toContain(`etiqueta-${shipment.trackingCode}.zpl`);
    expect(label.body).toContain('Maria Cliente');
  });

  it('rastreamento evolui com o tempo até ENTREGUE (mais recente primeiro)', async () => {
    await start();
    const { trackingCode, deadlineDays } = (await app.inject({ method: 'POST', url: '/envios', payload: body({ providerId: 'transportadora-sul', service: 'Rodoviário' }) })).json();
    expect(trackingCode).toMatch(/^FW/);
    const track = async () => (await app.inject({ method: 'GET', url: `/rastreamento/${trackingCode}` })).json();

    expect((await track()).status).toBe('POSTADO');
    now += deadlineDays * DAY * 0.5;
    expect((await track()).status).toBe('EM_TRANSITO');
    now += deadlineDays * DAY * 0.5;
    const final = await track();
    expect(final.status).toBe('ENTREGUE');
    expect(final.events.map((e: { status: string }) => e.status)).toEqual(['ENTREGUE', 'SAIU_PARA_ENTREGA', 'EM_TRANSITO', 'POSTADO']);
  });

  it('oferta inexistente → 422; código desconhecido → 404; corpo inválido → 400', async () => {
    await start();
    const r1 = await app.inject({ method: 'POST', url: '/envios', payload: body({ service: 'Teletransporte' }) });
    expect(r1.statusCode).toBe(422);
    expect(r1.json()).toMatchObject({ error: 'OFFER_UNAVAILABLE' });

    expect((await app.inject({ method: 'GET', url: '/rastreamento/OB000000005BR' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/rastreamento/qualquer' })).json()).toMatchObject({ error: 'NOT_FOUND' });
    expect((await app.inject({ method: 'GET', url: '/envios/XX/etiqueta' })).statusCode).toBe(404);

    const r3 = await app.inject({ method: 'POST', url: '/envios', payload: body({ recipient: { name: 'A' } }) });
    expect(r3.statusCode).toBe(400);
  });
});
