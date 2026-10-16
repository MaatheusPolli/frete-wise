import { useEffect, useState, type FormEvent } from 'react';
import { apiUrl, getTracking, type Shipment, type Tracking } from '../api';

const STATUS_LABEL: Record<Tracking['status'], string> = {
  POSTADO: 'Postado',
  EM_TRANSITO: 'Em trânsito',
  SAIU_PARA_ENTREGA: 'Saiu para entrega',
  ENTREGUE: 'Entregue',
};

const date = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** `lookup` dispara uma consulta externa (ex.: clique no histórico); o nonce permite repetir o mesmo código. */
export function TrackingPanel({ shipment, lookup }: { shipment: Shipment | null; lookup?: { code: string; nonce: number } }) {
  const [code, setCode] = useState('');
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(c: string) {
    setError(null);
    try {
      setTracking(await getTracking(c));
    } catch (e) {
      setTracking(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (shipment) {
      setCode(shipment.trackingCode);
      void load(shipment.trackingCode);
    }
  }, [shipment]);

  useEffect(() => {
    if (lookup) {
      setCode(lookup.code);
      void load(lookup.code);
    }
  }, [lookup]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void load(code);
  }

  return (
    <section className="space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">Rastreamento</h2>

      {shipment && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          Frete contratado! Código <strong>{shipment.trackingCode}</strong> · previsão {date(shipment.estimatedDeliveryAt)} ·{' '}
          <a className="font-medium underline" href={apiUrl(shipment.labelUrl)} download>
            baixar etiqueta (ZPL)
          </a>
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <input
          aria-label="Código de rastreio"
          placeholder="Ex.: OB123456785BR"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm uppercase focus:border-indigo-500 focus:outline-none"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button type="submit" className="rounded-md bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-900">
          Rastrear
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {tracking && (
        <div>
          <p className="mb-2 text-sm">
            <strong>{STATUS_LABEL[tracking.status]}</strong> · {tracking.providerId} {tracking.service} · previsão{' '}
            {date(tracking.estimatedDeliveryAt)}
          </p>
          <ol className="relative space-y-3 border-l border-slate-200 pl-4">
            {tracking.events.map((ev) => (
              <li key={ev.status} className="text-sm">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-indigo-500" />
                <div className="font-medium">{ev.description}</div>
                <div className="text-xs text-slate-500">{date(ev.at)}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
