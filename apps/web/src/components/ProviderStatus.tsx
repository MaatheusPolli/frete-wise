import { useEffect, useState } from 'react';
import { getProviders, type ProviderStatus as Status } from '../api';

const stateStyle: Record<Status['state'], { label: string; color: string }> = {
  closed: { label: 'fechado', color: 'bg-emerald-500' },
  'half-open': { label: 'meio-aberto', color: 'bg-amber-500' },
  open: { label: 'aberto', color: 'bg-red-500' },
};

export function ProviderStatus({ refreshKey }: { refreshKey: number }) {
  const [providers, setProviders] = useState<Status[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      getProviders()
        .then((p) => active && (setProviders(p), setError(false)))
        .catch(() => active && setError(true));
    load();
    const id = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [refreshKey]);

  return (
    <aside className="h-fit rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 font-semibold">Provedores</h2>
      {error && <p className="text-sm text-red-600">API indisponível</p>}
      <ul className="space-y-3">
        {providers.map((p) => (
          <li key={p.id} className="text-sm">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${stateStyle[p.state].color}`} />
              <span className="font-medium">{p.id}</span>
            </div>
            <div className="pl-4.5 text-xs text-slate-500">
              breaker {stateStyle[p.state].label} · {p.avgLatencyMs} ms · {p.calls} chamadas · {p.failures} falhas
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
