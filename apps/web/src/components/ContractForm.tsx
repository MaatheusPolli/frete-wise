import { useState, type FormEvent } from 'react';
import { formatMoney, type Offer, type Party } from '../api';

interface Props {
  offer: Offer;
  loading: boolean;
  onSubmit: (sender: Party, recipient: Party) => void;
  onCancel: () => void;
}

const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none';
const empty = (): Party => ({ name: '', street: '', number: '', complement: '', city: '' });

function PartyFields({ title, value, onChange }: { title: string; value: Party; onChange: (p: Party) => void }) {
  const field = (key: keyof Party, label: string, required = true) => (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        className={input}
        aria-label={`${title} - ${label}`}
        value={value[key] ?? ''}
        required={required}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {field('name', 'Nome')}
      <div className="grid grid-cols-[1fr_80px] gap-2">
        {field('street', 'Rua')}
        {field('number', 'Número')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field('complement', 'Complemento', false)}
        {field('city', 'Cidade')}
      </div>
    </fieldset>
  );
}

const compact = (p: Party): Party => (p.complement ? p : { name: p.name, street: p.street, number: p.number, city: p.city });

export function ContractForm({ offer, loading, onSubmit, onCancel }: Props) {
  const [sender, setSender] = useState<Party>(empty);
  const [recipient, setRecipient] = useState<Party>(empty);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(compact(sender), compact(recipient));
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-indigo-200">
      <h2 className="text-lg font-semibold">
        Contratar {offer.providerId} · {offer.service}{' '}
        <span className="text-sm font-normal text-slate-500">
          ({offer.price === 0 ? 'Grátis' : formatMoney(offer.price)}, {offer.deadlineDays} dias)
        </span>
      </h2>
      <p className="text-xs text-slate-500">O preço é confirmado pelo servidor no momento da contratação.</p>
      <div className="grid gap-6 sm:grid-cols-2">
        <PartyFields title="Remetente" value={sender} onChange={setSender} />
        <PartyFields title="Destinatário" value={recipient} onChange={setRecipient} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {loading ? 'Contratando…' : 'Confirmar contratação'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}
