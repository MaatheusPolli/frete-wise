import { useState } from 'react';
import {
  postQuote, postShipment, type Offer, type Party, type QuoteBody, type QuotationResult, type Shipment,
} from './api';
import { QuoteForm } from './components/QuoteForm';
import { OfferTable } from './components/OfferTable';
import { ProviderStatus } from './components/ProviderStatus';
import { ContractForm } from './components/ContractForm';
import { TrackingPanel } from './components/TrackingPanel';
import { ShipmentHistory } from './components/ShipmentHistory';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [result, setResult] = useState<QuotationResult | null>(null);
  const [lastBody, setLastBody] = useState<QuoteBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [contracting, setContracting] = useState(false);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [lookup, setLookup] = useState<{ code: string; nonce: number } | undefined>();

  async function handleSubmit(body: QuoteBody) {
    setLoading(true);
    setError(null);
    setSelected(null);
    const t0 = performance.now();
    try {
      setResult(await postQuote(body));
      setLastBody(body);
      setElapsed(Math.round(performance.now() - t0));
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
      setRefreshKey((k) => k + 1);
    }
  }

  async function handleContract(sender: Party, recipient: Party) {
    if (!selected || !lastBody) return;
    setContracting(true);
    setError(null);
    try {
      setShipment(await postShipment({ ...lastBody, providerId: selected.providerId, service: selected.service, sender, recipient }));
      setSelected(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setContracting(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">FreteWise</h1>
        <p className="text-slate-600">Cotação multi-transportadora em paralelo — provedor lento não derruba o checkout.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <QuoteForm onSubmit={handleSubmit} loading={loading} />
          {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</div>}
          {result && <OfferTable result={result} elapsedMs={elapsed} onContract={setSelected} />}
          {selected && (
            <ContractForm offer={selected} loading={contracting} onSubmit={handleContract} onCancel={() => setSelected(null)} />
          )}
          <TrackingPanel shipment={shipment} lookup={lookup} />
          <ShipmentHistory refreshKey={shipment ? 1 + refreshKey : refreshKey} onTrack={(code) => setLookup((l) => ({ code, nonce: (l?.nonce ?? 0) + 1 }))} />
        </div>
        <ProviderStatus refreshKey={refreshKey} />
      </div>
    </main>
  );
}
