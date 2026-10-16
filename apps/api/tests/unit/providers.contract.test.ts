import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSV_TABLE_PATH } from '../../src/container.js';
import { CorreiosProvider } from '../../src/providers/correios.provider.js';
import { CsvTableProvider, parseCsvTable } from '../../src/providers/csv-table.provider.js';
import { mapExpressoResponse } from '../../src/providers/expresso-http.provider.js';
import { item, request } from '../fixtures/factories.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/expresso-response.json', import.meta.url), 'utf8'));

describe('contrato: Expresso (resposta bruta → Offer)', () => {
  it('mapeia fixture gravada para centavos e breakdown', () => {
    expect(mapExpressoResponse('expresso', fixture)).toEqual([
      { providerId: 'expresso', service: 'Econômico', price: 1990, deadlineDays: 5,
        breakdown: { base: 1880, fees: [{ name: 'GRIS', value: 110 }] } },
      { providerId: 'expresso', service: 'Expresso', price: 3505, deadlineDays: 1, breakdown: { base: 3505, fees: [] } },
    ]);
  });
  it('resposta malformada vira INVALID_RESPONSE', () => {
    expect(() => mapExpressoResponse('expresso', { cotacoes: [{ valor: 'x' }] })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });
});

describe('contrato: Correios (tabela simulada)', () => {
  const p = new CorreiosProvider();
  it('mesma região: PAC e SEDEX sem acréscimo', async () => {
    const offers = await p.quote(request({ destination: { cep: '20000000', uf: 'RJ' } }));
    expect(offers.map((o) => [o.service, o.price, o.deadlineDays])).toEqual([['PAC', 2190, 6], ['SEDEX', 3490, 2]]);
  });
  it('regiões distantes e desconhecidas encarecem e atrasam', async () => {
    const far = await p.quote(request({ destination: { cep: '69000000', uf: 'AM' } }));
    expect(far[0]).toMatchObject({ price: 3066, deadlineDays: 9 });
    const unknown = await p.quote(request({ destination: { cep: '00000000' } }));
    expect(unknown[0]).toMatchObject({ price: 3285, deadlineDays: 9 });
    const near = await p.quote(request({ items: [item({ weightGrams: 2500 })] }));
    expect(near[0]).toMatchObject({ price: Math.round((2190 + 2 * 450) * 1.2), deadlineDays: 7 });
  });
  it('acima de 30 kg falha como rota não atendida', async () => {
    await expect(p.quote(request({ items: [item({ weightGrams: 31_000 })] }))).rejects.toMatchObject({ code: 'UNSUPPORTED_ROUTE' });
  });
});

describe('contrato: tabela CSV', () => {
  const p = CsvTableProvider.fromFile('transportadora-sul', CSV_TABLE_PATH);
  it('escolhe a menor faixa de peso que atende', async () => {
    const [o] = await p.quote(request());
    expect(o).toMatchObject({ providerId: 'transportadora-sul', service: 'Rodoviário', price: 2290, deadlineDays: 3 });
  });
  it('rota não atendida', async () => {
    await expect(p.quote(request({ destination: { cep: '69000000', uf: 'AM' } }))).rejects.toMatchObject({ code: 'UNSUPPORTED_ROUTE' });
    await expect(p.quote(request({ origin: { cep: '00000000' } }))).rejects.toThrow(/\?/);
  });
  it('valida CSV', () => {
    expect(() => parseCsvTable('a,b\n1,2')).toThrow(/Cabeçalho/);
    expect(() => parseCsvTable('origem_uf,destino_regiao,peso_max_g,preco_centavos,prazo_dias\nSP,S,x,1,1')).toThrow(/Linha CSV/);
    const rows = parseCsvTable(readFileSync(CSV_TABLE_PATH, 'utf8'));
    expect(new CsvTableProvider('x', rows).id).toBe('x');
  });
});
