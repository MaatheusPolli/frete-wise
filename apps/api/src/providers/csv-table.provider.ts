import { readFileSync } from 'node:fs';
import { Money } from '../domain/money.js';
import { billableWeightGrams } from '../domain/package.js';
import type { Offer, QuoteRequest } from '../domain/quote.js';
import { regionOf } from '../domain/regions.js';
import { ProviderError } from '../domain/errors.js';
import type { ShippingProvider } from './types.js';

export interface TableRow {
  originUf: string;
  destRegion: string;
  maxWeightGrams: number;
  priceCents: number;
  deadlineDays: number;
}

export function parseCsvTable(csv: string): TableRow[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const expected = 'origem_uf,destino_regiao,peso_max_g,preco_centavos,prazo_dias';
  if (header?.trim() !== expected) throw new Error(`Cabeçalho CSV inválido: ${header}`);
  return lines
    .filter((l) => l.trim().length > 0)
    .map((line, idx) => {
      const [originUf, destRegion, maxW, price, days] = line.split(',').map((c) => c.trim());
      const row = {
        originUf: originUf?.toUpperCase() ?? '',
        destRegion: destRegion?.toUpperCase() ?? '',
        maxWeightGrams: Number(maxW),
        priceCents: Number(price),
        deadlineDays: Number(days),
      };
      if (!row.originUf || !row.destRegion || ![row.maxWeightGrams, row.priceCents, row.deadlineDays].every(Number.isInteger)) {
        throw new Error(`Linha CSV inválida (${idx + 2}): ${line}`);
      }
      return row;
    });
}

/** Transportadora fictícia cujo preço vem de uma tabela CSV (faixas de peso por rota). */
export class CsvTableProvider implements ShippingProvider {
  readonly cubicFactor = 300; // rodoviário, kg/m³
  private readonly rows: TableRow[];

  constructor(readonly id: string, rowsOrCsv: TableRow[] | string, private readonly service = 'Rodoviário') {
    this.rows = typeof rowsOrCsv === 'string' ? parseCsvTable(rowsOrCsv) : rowsOrCsv;
  }

  static fromFile(id: string, path: string): CsvTableProvider {
    return new CsvTableProvider(id, readFileSync(path, 'utf8'));
  }

  async quote(req: QuoteRequest): Promise<Offer[]> {
    const weight = billableWeightGrams(req.items, this.cubicFactor);
    const originUf = req.origin.uf?.toUpperCase();
    const destRegion = regionOf(req.destination.uf);
    const row = this.rows
      .filter((r) => r.originUf === originUf && r.destRegion === destRegion && weight <= r.maxWeightGrams)
      .sort((a, b) => a.maxWeightGrams - b.maxWeightGrams)[0];
    if (!row) throw new ProviderError(this.id, `Rota ${originUf ?? '?'} → ${destRegion ?? '?'} não atendida`, 'UNSUPPORTED_ROUTE');
    const base = Money.ofCents(row.priceCents);
    return [{ providerId: this.id, service: this.service, price: base, deadlineDays: row.deadlineDays, breakdown: { base, fees: [] } }];
  }
}
