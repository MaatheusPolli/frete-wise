import type { QuotationResult, QuoteRequest } from '../domain/quote.js';
import type { Database } from './db/database.js';

export interface QuotationRecord {
  correlationId: string;
  originCep: string;
  destinationCep: string;
  offers: QuotationResult['offers'];
  failures: QuotationResult['failures'];
  cheapestCents: number | null;
  cached: boolean;
  durationMs: number;
  createdAt: string;
}

export interface QuotationStore {
  record(req: QuoteRequest, result: QuotationResult, durationMs: number): Promise<void>;
  get(correlationId: string): Promise<QuotationRecord | undefined>;
  list(opts: { limit: number; offset: number }): Promise<{ total: number; items: QuotationRecord[] }>;
}

interface Row {
  correlation_id: string;
  origin_cep: string;
  destination_cep: string;
  offers: QuotationRecord['offers'];
  failures: QuotationRecord['failures'];
  cheapest_cents: number | null;
  cached: boolean;
  duration_ms: number;
  created_at: Date | string;
}

const fromRow = (r: Row): QuotationRecord => ({
  correlationId: r.correlation_id,
  originCep: r.origin_cep,
  destinationCep: r.destination_cep,
  offers: r.offers,
  failures: r.failures,
  cheapestCents: r.cheapest_cents === null ? null : Number(r.cheapest_cents),
  cached: r.cached,
  durationMs: r.duration_ms,
  createdAt: new Date(r.created_at).toISOString(),
});

/** Histórico de cotações (auditoria e análise de preço/falhas por provedor). */
export class PgQuotationStore implements QuotationStore {
  constructor(private readonly db: Database) {}

  async record(req: QuoteRequest, result: QuotationResult, durationMs: number): Promise<void> {
    await this.db.query(
      `INSERT INTO quotations (correlation_id, origin_cep, destination_cep, request, offers, failures, cheapest_cents, cached, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (correlation_id) DO NOTHING`,
      [
        result.correlationId, req.origin.cep, req.destination.cep,
        JSON.stringify({ origin: req.origin, destination: req.destination, items: req.items }),
        JSON.stringify(result.offers), JSON.stringify(result.failures),
        result.offers[0]?.price ?? null, result.cached, Math.round(durationMs),
      ],
    );
  }

  async get(correlationId: string): Promise<QuotationRecord | undefined> {
    const [row] = await this.db.query<Row>('SELECT * FROM quotations WHERE correlation_id = $1', [correlationId]);
    return row ? fromRow(row) : undefined;
  }

  async list({ limit, offset }: { limit: number; offset: number }) {
    const [count] = await this.db.query<{ total: number }>('SELECT count(*)::int AS total FROM quotations');
    const rows = await this.db.query<Row>('SELECT * FROM quotations ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return { total: count!.total, items: rows.map(fromRow) };
  }
}
