import { DomainError } from '../domain/errors.js';
import type { Item } from '../domain/package.js';
import type { Shipment, TrackingEvent, Party } from '../domain/shipment.js';
import { isValidTrackingCode, trackingCode, trackingEvents } from '../domain/shipment.js';
import type { ShipmentStore } from '../infra/shipment-store.js';
import type { QuotationService } from './quotation.service.js';

export class OfferUnavailableError extends DomainError {
  constructor(providerId: string, service: string) {
    super(`Oferta ${providerId}/${service} indisponível para esta rota agora`, 'OFFER_UNAVAILABLE');
  }
}

export class ShipmentNotFoundError extends DomainError {
  constructor(code: string) {
    super(`Envio ${code} não encontrado`, 'NOT_FOUND');
  }
}

export interface ContractInput {
  providerId: string;
  service: string;
  origin: { cep: string };
  destination: { cep: string };
  items: Item[];
  sender: Party;
  recipient: Party;
  correlationId: string;
}

export interface TrackingResult {
  trackingCode: string;
  providerId: string;
  service: string;
  status: TrackingEvent['status'];
  estimatedDeliveryAt: string;
  events: TrackingEvent[];
}

export interface ShipmentServiceOptions {
  /** duração simulada de 1 dia de prazo (ms) */
  trackingDayMs: number;
  now?: () => number;
}

export class ShipmentService {
  private readonly now: () => number;

  constructor(
    private readonly quotation: QuotationService,
    private readonly store: ShipmentStore,
    private readonly opts: ShipmentServiceOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  /**
   * Contrata o frete. O preço NUNCA vem do cliente: recotamos e usamos a oferta vigente,
   * garantindo que regras (frete grátis, taxas) e disponibilidade estejam atualizadas.
   */
  async contract(input: ContractInput): Promise<Shipment> {
    const quote = await this.quotation.quote({
      origin: input.origin, destination: input.destination, items: input.items, correlationId: input.correlationId,
    });
    const offer = quote.offers.find((o) => o.providerId === input.providerId && o.service === input.service);
    if (!offer) throw new OfferUnavailableError(input.providerId, input.service);

    const [origin, destination] = await Promise.all([
      this.quotation.resolveCep(input.origin.cep),
      this.quotation.resolveCep(input.destination.cep),
    ]);
    const createdAt = this.now();
    const shipment: Shipment = {
      trackingCode: trackingCode(input.providerId === 'correios' ? 'OB' : 'FW', await this.store.nextSequence()),
      providerId: offer.providerId,
      service: offer.service,
      price: offer.price,
      deadlineDays: offer.deadlineDays,
      breakdown: offer.breakdown,
      origin,
      destination,
      sender: input.sender,
      recipient: input.recipient,
      items: input.items,
      createdAt: new Date(createdAt).toISOString(),
      estimatedDeliveryAt: new Date(createdAt + Math.max(1, offer.deadlineDays) * this.opts.trackingDayMs).toISOString(),
      correlationId: input.correlationId,
    };
    await this.store.save(shipment);
    return shipment;
  }

  async get(code: string): Promise<Shipment> {
    const normalized = code.trim().toUpperCase();
    const shipment = isValidTrackingCode(normalized) ? await this.store.get(normalized) : undefined;
    if (!shipment) throw new ShipmentNotFoundError(code);
    return shipment;
  }

  async list(limit: number, offset: number) {
    return this.store.list({ limit, offset });
  }

  async track(code: string): Promise<TrackingResult> {
    const s = await this.get(code);
    const events = trackingEvents(s, this.now(), this.opts.trackingDayMs);
    return {
      trackingCode: s.trackingCode,
      providerId: s.providerId,
      service: s.service,
      status: events.at(-1)!.status,
      estimatedDeliveryAt: s.estimatedDeliveryAt,
      events: [...events].reverse(),
    };
  }
}
