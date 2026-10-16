import { useState, type FormEvent } from 'react';
import type { QuoteBody, QuoteItem } from '../api';

interface Props {
  onSubmit: (body: QuoteBody) => void;
  loading: boolean;
}

const emptyItem = (): QuoteItem => ({ weightGrams: 1200, lengthCm: 30, widthCm: 20, heightCm: 10, quantity: 1, valueCents: 15000 });

const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none';

export function QuoteForm({ onSubmit, loading }: Props) {
  const [origin, setOrigin] = useState('01310-100');
  const [destination, setDestination] = useState('80010-000');
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);

  const update = (idx: number, field: keyof QuoteItem, value: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ origin: { cep: origin }, destination: { cep: destination }, items });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm font-medium">
          CEP origem
          <input className={input} value={origin} onChange={(e) => setOrigin(e.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          CEP destino
          <input className={input} value={destination} onChange={(e) => setDestination(e.target.value)} required />
        </label>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[repeat(6,1fr)_32px] gap-2 text-xs font-medium text-slate-500 sm:grid">
          <span>Peso (g)</span><span>Compr. (cm)</span><span>Larg. (cm)</span><span>Alt. (cm)</span><span>Qtd.</span><span>Valor (R$)</span><span />
        </div>
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(6,1fr)_32px]">
            <input className={input} type="number" min={0} aria-label="Peso (g)" value={it.weightGrams} onChange={(e) => update(idx, 'weightGrams', Number(e.target.value))} />
            <input className={input} type="number" min={1} aria-label="Comprimento (cm)" value={it.lengthCm} onChange={(e) => update(idx, 'lengthCm', Number(e.target.value))} />
            <input className={input} type="number" min={1} aria-label="Largura (cm)" value={it.widthCm} onChange={(e) => update(idx, 'widthCm', Number(e.target.value))} />
            <input className={input} type="number" min={1} aria-label="Altura (cm)" value={it.heightCm} onChange={(e) => update(idx, 'heightCm', Number(e.target.value))} />
            <input className={input} type="number" min={1} aria-label="Quantidade" value={it.quantity} onChange={(e) => update(idx, 'quantity', Number(e.target.value))} />
            <input className={input} type="number" min={0} step="0.01" aria-label="Valor (R$)" value={it.valueCents / 100} onChange={(e) => update(idx, 'valueCents', Math.round(Number(e.target.value) * 100))} />
            <button type="button" aria-label="Remover item" disabled={items.length === 1} onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600 disabled:opacity-30">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((p) => [...p, emptyItem()])} className="text-sm text-indigo-600 hover:underline">
          + adicionar item
        </button>
      </div>

      <button type="submit" disabled={loading} className="w-full rounded-md bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
        {loading ? 'Cotando…' : 'Cotar frete'}
      </button>
    </form>
  );
}
