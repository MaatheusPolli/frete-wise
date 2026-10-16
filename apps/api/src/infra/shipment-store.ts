import type { Money } from '../domain/money.js';
import type { Shipment } from '../domain/shipment.js';
import type { Database } from './db/database.js';

export interface ListOptions {
  limit: number;
  offset: number;
}

export interface ShipmentStore {
  nextSequence(): Promise<number>;
  save(shipment: Shipment): Promise<void>;
  get(trackingCode: string): Promise<Shipment | undefined>;
  list(opts: ListOptions): Promise<{ total: number; items: Shipment[] }>;
}

interface ShipmentRow {
  tracking_code: string;
  provider_id: string;
  service: string;
  price_cents: number;
  deadline_days: number;
  breakdown: Shipment['breakdown'];
  origin: Shipment['origin'];
  destination: Shipment['destination'];
  sender: Shipment['sender'];
  recipient: Shipment['recipient'];
  items: Shipment['items'];
  correlation_id: string;
  created_at: Date | string;
  estimated_delivery_at: Date | string;
}

const iso = (d: Date | string) => new Date(d).toISOString();

function fromRow(r: ShipmentRow): Shipment {
  return {
    trackingCode: r.tracking_code,
    providerId: r.provider_id,
    service: r.service,
    price: r.price_cents as Money,
    deadlineDays: r.deadline_days,
    breakdown: r.breakdown,
    origin: r.origin,
    destination: r.destination,
    sender: r.sender,
    recipient: r.recipient,
    items: r.items,
    correlationId: r.correlation_id,
    createdAt: iso(r.created_at),
    estimatedDeliveryAt: iso(r.estimated_delivery_at),
  };
}

/** Persistência em PostgreSQL (ou PGlite). */
export class PgShipmentStore implements ShipmentStore {
  constructor(private readonly db: Database) {}

  async nextSequence(): Promise<number> {
    const [row] = await this.db.query<{ seq: number }>("SELECT nextval('shipment_seq') AS seq");
    return Number(row!.seq);
  }

  async save(s: Shipment): Promise<void> {
    await this.db.query(
      `INSERT INTO shipments (tracking_code, provider_id, service, price_cents, deadline_days, breakdown, origin, destination,
         sender, recipient, items, correlation_id, created_at, estimated_delivery_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        s.trackingCode, s.providerId, s.service, s.price, s.deadlineDays,
        JSON.stringify(s.breakdown), JSON.stringify(s.origin), JSON.stringify(s.destination),
        JSON.stringify(s.sender), JSON.stringify(s.recipient), JSON.stringify(s.items),
        s.correlationId, s.createdAt, s.estimatedDeliveryAt,
      ],
    );
  }

  async get(trackingCode: string): Promise<Shipment | undefined> {
    const [row] = await this.db.query<ShipmentRow>('SELECT * FROM shipments WHERE tracking_code = $1', [trackingCode]);
    return row ? fromRow(row) : undefined;
  }

  async list({ limit, offset }: ListOptions): Promise<{ total: number; items: Shipment[] }> {
    const [count] = await this.db.query<{ total: number }>('SELECT count(*)::int AS total FROM shipments');
    const rows = await this.db.query<ShipmentRow>(
      'SELECT * FROM shipments ORDER BY created_at DESC, tracking_code DESC LIMIT $1 OFFSET $2', [limit, offset],
    );
    return { total: count!.total, items: rows.map(fromRow) };
  }
}
