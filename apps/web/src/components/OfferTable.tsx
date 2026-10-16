import { formatMoney, type Offer, type QuotationResult } from '../api';

interface Props {
  result: QuotationResult;
  elapsedMs: number | null;
  onContract?: (offer: Offer) => void;
}

const Badge = ({ children, color }: { children: string; color: string }) => (
  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{children}</span>
);

export function OfferTable({ result, elapsedMs, onContract }: Props) {
  const is = (pick: QuotationResult['cheapest'], o: { providerId: string; service: string }) =>
    pick?.providerId === o.providerId && pick.service === o.service;

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Opções de frete</h2>
        <span className="text-xs text-slate-500">
          {elapsedMs !== null && `${elapsedMs} ms · `}
          {result.cached ? 'do cache · ' : ''}id {result.correlationId.slice(0, 8)}
        </span>
      </div>

      {result.offers.length === 0 ? (
        <p className="text-slate-500">Nenhuma opção disponível para esta rota.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Transportadora</th>
                <th>Serviço</th>
                <th className="text-right">Prazo</th>
                <th className="text-right">Preço</th>
                {onContract && <th />}
              </tr>
            </thead>
            <tbody>
              {result.offers.map((o) => (
                <tr key={`${o.providerId}-${o.service}`} className="border-t border-slate-100 align-top">
                  <td className="py-2 font-medium">{o.providerId}</td>
                  <td>
                    {o.service}
                    {is(result.cheapest, o) && <Badge color="bg-emerald-100 text-emerald-800">mais barato</Badge>}
                    {is(result.fastest, o) && <Badge color="bg-sky-100 text-sky-800">mais rápido</Badge>}
                  </td>
                  <td className="text-right">{o.deadlineDays} {o.deadlineDays === 1 ? 'dia' : 'dias'}</td>
                  <td className="text-right">
                    <div className="font-semibold">{o.price === 0 ? 'Grátis' : formatMoney(o.price)}</div>
                    {o.breakdown.fees.length > 0 && (
                      <div className="text-xs text-slate-500">
                        base {formatMoney(o.breakdown.base)}
                        {o.breakdown.fees.map((f) => (
                          <div key={f.name}>{f.name}: {formatMoney(f.value)}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  {onContract && (
                    <td className="pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onContract(o)}
                        aria-label={`Contratar ${o.providerId} ${o.service}`}
                        className="rounded-md border border-indigo-600 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                      >
                        Contratar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.failures.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Resultado parcial.</strong> Provedores sem resposta:
          <ul className="mt-1 list-disc pl-5">
            {result.failures.map((f) => (
              <li key={f.providerId}><code>{f.providerId}</code> — {f.code}: {f.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
