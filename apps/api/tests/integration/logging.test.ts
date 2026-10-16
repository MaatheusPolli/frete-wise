import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { sharedTestDb } from '../fixtures/db.js';

const testDb = sharedTestDb();
import { loadConfig } from '../../src/config.js';
import { StaticCepResolver } from '../../src/infra/cep-resolver.js';

describe('logs estruturados', () => {
  it('todo log da requisição carrega correlationId (e não reqId)', async () => {
    const lines: Record<string, unknown>[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        for (const l of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(l));
        cb();
      },
    });
    const { app } = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', PGLITE_DATA_DIR: 'memory' }), {
      cepResolver: new StaticCepResolver(),
      logStream: stream,
      db: await testDb(),
    });
    await app.inject({
      method: 'POST', url: '/cotacoes', headers: { 'x-correlation-id': 'corr-42' },
      payload: { origin: { cep: '01310100' }, destination: { cep: '80010000' },
        items: [{ weightGrams: 1000, lengthCm: 10, widthCm: 10, heightCm: 10, quantity: 1, valueCents: 100 }] },
    });
    await app.close();
    const reqLogs = lines.filter((l) => l.correlationId === 'corr-42');
    expect(reqLogs.map((l) => l.msg)).toEqual(expect.arrayContaining(['incoming request', 'provider respondeu', 'cotação concluída', 'request completed']));
    expect(lines.some((l) => 'reqId' in l)).toBe(false);
  });
});
