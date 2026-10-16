export const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface QuoteItem {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  quantity: number;
  valueCents: number;
}

export interface QuoteBody {
  origin: { cep: string };
  destination: { cep: string };
  items: QuoteItem[];
}

export interface Offer {
  providerId: string;
  service: string;
  price: number;
  deadlineDays: number;
  breakdown: { base: number; fees: Array<{ name: string; value: number }> };
}

export interface QuotationResult {
  correlationId: string;
  offers: Offer[];
  failures: Array<{ providerId: string; code: string; reason: string }>;
  cheapest?: { providerId: string; service: string };
  fastest?: { providerId: string; service: string };
  cached: boolean;
}

export interface ProviderStatus {
  id: string;
  state: 'closed' | 'open' | 'half-open';
  avgLatencyMs: number;
  calls: number;
  failures: number;
}

export async function postQuote(body: QuoteBody): Promise<QuotationResult> {
  const res = await fetch(`${API_URL}/cotacoes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function getProviders(): Promise<ProviderStatus[]> {
  const res = await fetch(`${API_URL}/provedores`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return (await res.json()).providers;
}

export const formatMoney = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface Party {
  name: string;
  street: string;
  number: string;
  complement?: string;
  city: string;
}

export interface ContractBody extends QuoteBody {
  providerId: string;
  service: string;
  sender: Party;
  recipient: Party;
}

export interface Shipment {
  trackingCode: string;
  providerId: string;
  service: string;
  price: number;
  deadlineDays: number;
  estimatedDeliveryAt: string;
  labelUrl: string;
  trackingUrl: string;
}

export interface Tracking {
  trackingCode: string;
  providerId: string;
  service: string;
  status: 'POSTADO' | 'EM_TRANSITO' | 'SAIU_PARA_ENTREGA' | 'ENTREGUE';
  estimatedDeliveryAt: string;
  events: Array<{ status: string; description: string; at: string }>;
}

async function errorMessage(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({}));
  return err.issues?.map((i: { message: string }) => i.message).join('; ') ?? err.message ?? `Erro ${res.status}`;
}

export async function postShipment(body: ContractBody): Promise<Shipment> {
  const res = await fetch(`${API_URL}/envios`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function getTracking(code: string): Promise<Tracking> {
  const res = await fetch(`${API_URL}/rastreamento/${encodeURIComponent(code.trim())}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export const apiUrl = (path: string) => `${API_URL}${path}`;

export interface ShipmentSummary extends Shipment {
  createdAt: string;
  recipient: Party;
  destination: { cep: string; uf?: string };
}

export async function getShipments(limit = 10): Promise<{ total: number; items: ShipmentSummary[] }> {
  const res = await fetch(`${API_URL}/envios?limit=${limit}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
