/**
 * Carga leve: 100 req/s durante 15 s contra a API real (in-process), com o provedor
 * "expresso" TRAVADO (nunca responde). Mede p95 para validar o requisito < 3,5 s.
 * Uso: pnpm --filter @frete-wise/api load
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';

const RATE = Number(process.env.RATE ?? 100);
const DURATION = Number(process.env.DURATION ?? 15);

// Upstream falso: CEP responde rápido; expresso fica pendurado para sempre.
const upstream = createServer((req, res) => {
  if (req.url?.startsWith('/ws/')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ uf: req.url.includes('/8') ? 'PR' : 'SP', localidade: 'X' }));
  }
  // /v1/cotacao: nunca responde
});
await new Promise<void>((r) => upstream.listen(0, r));
const up = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

const { app } = await buildApp(
  loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'silent', CACHE_TTL_MS: '0', CEP_API_URL: `${up}/ws`, EXPRESSO_API_URL: up }),
);
await app.listen({ port: 0, host: '127.0.0.1' });
const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/cotacoes`;

const body = JSON.stringify({
  origin: { cep: '01310-100' },
  destination: { cep: '80010-000' },
  items: [{ weightGrams: 1200, lengthCm: 30, widthCm: 20, heightCm: 10, quantity: 1, valueCents: 15000 }],
});

// Open-loop: dispara a cada 1000/RATE ms sem esperar respostas (não mascara lentidão).
const latencies: number[] = [];
let non2xx = 0;
let errors = 0;
const inflight: Promise<void>[] = [];
const total = RATE * DURATION;
const t0 = performance.now();
for (let i = 0; i < total; i++) {
  const wait = t0 + (i * 1000) / RATE - performance.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const start = performance.now();
  inflight.push(
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      .then(async (res) => {
        await res.arrayBuffer();
        if (res.status !== 200) non2xx++;
        latencies.push(performance.now() - start);
      })
      .catch(() => { errors++; }),
  );
}
await Promise.all(inflight);

latencies.sort((a, b) => a - b);
const pct = (p: number) => Math.round(latencies[Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1)] ?? 0);
console.log(JSON.stringify({
  rate: RATE, durationS: DURATION, requests: latencies.length, non2xx, errors,
  latencyMs: { p50: pct(50), p95: pct(95), p99: pct(99), max: pct(100) },
}, null, 2));

await app.close();
upstream.closeAllConnections();
upstream.close();
process.exit(0);
