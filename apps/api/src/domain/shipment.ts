import type { Money } from './money.js';
import type { Address, Offer } from './quote.js';
import type { Item } from './package.js';

export interface Party {
  name: string;
  document?: string;
  street: string;
  number: string;
  complement?: string;
  city: string;
}

export type TrackingStatus = 'POSTADO' | 'EM_TRANSITO' | 'SAIU_PARA_ENTREGA' | 'ENTREGUE';

export interface TrackingEvent {
  status: TrackingStatus;
  description: string;
  at: string; // ISO
}

export interface Shipment {
  trackingCode: string;
  providerId: string;
  service: string;
  price: Money;
  deadlineDays: number;
  breakdown: Offer['breakdown'];
  origin: Address;
  destination: Address;
  sender: Party;
  recipient: Party;
  items: Item[];
  createdAt: string;
  estimatedDeliveryAt: string;
  correlationId: string;
}

/** Linha do tempo por fração do prazo decorrido. */
const MILESTONES: Array<{ at: number; status: TrackingStatus; description: string }> = [
  { at: 0, status: 'POSTADO', description: 'Objeto postado' },
  { at: 0.25, status: 'EM_TRANSITO', description: 'Objeto em trânsito' },
  { at: 0.9, status: 'SAIU_PARA_ENTREGA', description: 'Objeto saiu para entrega' },
  { at: 1, status: 'ENTREGUE', description: 'Objeto entregue ao destinatário' },
];

/**
 * Rastreamento simulado e determinístico: os eventos derivam só de createdAt, prazo e relógio.
 * `dayMs` permite acelerar a simulação (ex.: 1 dia = 1 minuto em demo).
 */
export function trackingEvents(shipment: Pick<Shipment, 'createdAt' | 'deadlineDays'>, now: number, dayMs: number): TrackingEvent[] {
  const start = Date.parse(shipment.createdAt);
  const total = Math.max(1, shipment.deadlineDays) * dayMs;
  return MILESTONES.filter((m) => now >= start + m.at * total).map((m) => ({
    status: m.status,
    description: m.description,
    at: new Date(start + Math.round(m.at * total)).toISOString(),
  }));
}

/** Código no formato dos Correios: 2 letras + 8 dígitos + dígito verificador + BR. */
export function trackingCode(prefix: string, seq: number): string {
  const digits = String(seq % 100_000_000).padStart(8, '0');
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  const sum = digits.split('').reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0);
  const rest = sum % 11;
  const dv = rest === 0 ? 5 : rest === 1 ? 0 : 11 - rest;
  return `${prefix.slice(0, 2).toUpperCase()}${digits}${dv}BR`;
}

export function isValidTrackingCode(code: string): boolean {
  const m = /^([A-Z]{2})(\d{8})(\d)BR$/.exec(code);
  return !!m && trackingCode(m[1]!, Number(m[2])) === code;
}
