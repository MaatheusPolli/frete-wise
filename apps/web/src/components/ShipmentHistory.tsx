import { useEffect, useState } from 'react';
import { formatMoney, getShipments, type ShipmentSummary } from '../api';

interface Props {
  refreshKey: number;
  onTrack: (code: string) => void;
}

export function ShipmentHistory({ refreshKey, onTrack }: Props) {
  const [data, setData] = useState<{ total: number; items: ShipmentSummary[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getShipments()
      .then((d) => active && (setData(d), setError(false)))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 text-lg font-semibold">
        Envios recentes {data && <span className="text-sm font-normal text-slate-500">({data.total} no total)</span>}
      </h2>
      {error && <p className="text-sm text-red-700">Não foi possível carregar os envios.</p>}
      {data && data.items.length === 0 && <p className="text-sm text-slate-500">Nenhum envio contratado ainda.</p>}
      {data && data.items.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.items.map((s) => (
            <li key={s.trackingCode} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <div className="font-mono font-medium">{s.trackingCode}</div>
                <div className="text-xs text-slate-500">
                  {s.providerId} {s.service} · {s.recipient.name} · {s.destination.uf ?? s.destination.cep} ·{' '}
                  {s.price === 0 ? 'Grátis' : formatMoney(s.price)} · {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onTrack(s.trackingCode)}
                aria-label={`Rastrear ${s.trackingCode}`}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                Rastrear
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
