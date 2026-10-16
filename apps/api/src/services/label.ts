import { Money } from '../domain/money.js';
import type { Party, Shipment } from '../domain/shipment.js';
import { realWeightGrams } from '../domain/package.js';

const cep = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
const clean = (s: string) => s.replace(/[\^~\\]/g, ' ').slice(0, 60);

function partyLines(p: Party, c: string, uf?: string): string[] {
  return [
    clean(p.name),
    clean(`${p.street}, ${p.number}${p.complement ? ` - ${p.complement}` : ''}`),
    clean(`${p.city}${uf ? `/${uf}` : ''} CEP ${cep(c)}`),
  ];
}

/** Etiqueta em ZPL (impressoras térmicas Zebra, 10x15 cm @ 203 dpi). */
export function renderZpl(s: Shipment): string {
  const lines: string[] = ['^XA', '^CI28', '^PW812', '^LL1218'];
  let y = 40;
  const text = (t: string, size = 30) => {
    lines.push(`^FO40,${y}^A0N,${size},${size}^FD${t}^FS`);
    y += size + 12;
  };
  text(`FreteWise - ${clean(s.providerId)} ${clean(s.service)}`, 40);
  lines.push(`^FO40,${y}^BY3^BCN,160,Y,N,N^FD${s.trackingCode}^FS`);
  y += 230;
  text('DESTINATARIO', 28);
  partyLines(s.recipient, s.destination.cep, s.destination.uf).forEach((l) => text(l, 36));
  y += 20;
  text('REMETENTE', 24);
  partyLines(s.sender, s.origin.cep, s.origin.uf).forEach((l) => text(l, 26));
  y += 20;
  text(`Peso: ${(realWeightGrams(s.items) / 1000).toFixed(3)} kg   Frete: ${Money.format(s.price)}`, 26);
  text(`Previsao: ${s.estimatedDeliveryAt.slice(0, 10)}`, 26);
  lines.push('^XZ');
  return lines.join('\n');
}
