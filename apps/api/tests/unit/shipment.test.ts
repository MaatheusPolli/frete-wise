import { describe, expect, it } from 'vitest';
import { isValidTrackingCode, trackingCode, trackingEvents } from '../../src/domain/shipment.js';
import { Money } from '../../src/domain/money.js';
import { renderZpl } from '../../src/services/label.js';
import type { Shipment } from '../../src/domain/shipment.js';
import { item } from '../fixtures/factories.js';

const DAY = 1000;

describe('código de rastreio', () => {
  it('gera no formato AA00000000DBR com dígito verificador válido', () => {
    const code = trackingCode('ob', 12345678);
    expect(code).toMatch(/^OB\d{9}BR$/);
    expect(isValidTrackingCode(code)).toBe(true);
    expect(isValidTrackingCode(code.replace(/\d(?=BR$)/, (d) => String((Number(d) + 1) % 10)))).toBe(false);
    expect(isValidTrackingCode('lixo')).toBe(false);
  });
  it('cobre os casos especiais do DV (resto 0 → 5, resto 1 → 0)', () => {
    const dvs = new Set<string>();
    for (let i = 0; i < 200; i++) dvs.add(trackingCode('FW', i).at(-3)!);
    expect(dvs.has('5')).toBe(true);
    expect(dvs.has('0')).toBe(true);
  });
});

describe('linha do tempo simulada', () => {
  const s = { createdAt: new Date(0).toISOString(), deadlineDays: 4 };
  it('avança conforme a fração do prazo', () => {
    expect(trackingEvents(s, 0, DAY).map((e) => e.status)).toEqual(['POSTADO']);
    expect(trackingEvents(s, 1000, DAY).map((e) => e.status)).toEqual(['POSTADO', 'EM_TRANSITO']);
    expect(trackingEvents(s, 3600, DAY).map((e) => e.status)).toEqual(['POSTADO', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA']);
    const done = trackingEvents(s, 4000, DAY);
    expect(done.at(-1)).toEqual({ status: 'ENTREGUE', description: 'Objeto entregue ao destinatário', at: new Date(4000).toISOString() });
  });
  it('prazo 0 é tratado como 1 dia', () => {
    expect(trackingEvents({ ...s, deadlineDays: 0 }, 1000, DAY)).toHaveLength(4);
  });
});

describe('etiqueta ZPL', () => {
  it('contém código de barras, endereços e sanitiza comandos ZPL', () => {
    const party = { name: 'Ana ^XZ Silva', street: 'Rua A', number: '10', complement: 'ap 2', city: 'Curitiba' };
    const shipment: Shipment = {
      trackingCode: trackingCode('FW', 1), providerId: 'correios', service: 'PAC', price: Money.ofCents(2365), deadlineDays: 3,
      breakdown: { base: Money.ofCents(2365), fees: [] },
      origin: { cep: '01310100', uf: 'SP' }, destination: { cep: '80010000' },
      sender: { ...party, complement: undefined }, recipient: party, items: [item({ weightGrams: 1500 })],
      createdAt: new Date(0).toISOString(), estimatedDeliveryAt: '1970-01-04T00:00:00.000Z', correlationId: 'c',
    };
    const zpl = renderZpl(shipment);
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
    expect(zpl.match(/\^XZ/g)).toHaveLength(1);
    expect(zpl).toContain(`^FD${shipment.trackingCode}^FS`);
    expect(zpl).toContain('Rua A, 10 - ap 2');
    expect(zpl).toContain('Curitiba CEP 80010-000');
    expect(zpl).toContain('Curitiba/SP CEP 01310-100');
    expect(zpl).toContain('Peso: 1.500 kg');
    expect(zpl).toContain('R$ 23,65');
  });
});
