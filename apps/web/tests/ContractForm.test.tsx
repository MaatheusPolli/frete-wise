import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContractForm } from '../src/components/ContractForm';
import { result } from './fixtures';

async function fill(user: ReturnType<typeof userEvent.setup>, who: string, values: Record<string, string>) {
  for (const [label, v] of Object.entries(values)) await user.type(screen.getByLabelText(`${who} - ${label}`), v);
}

describe('<ContractForm />', () => {
  it('envia remetente e destinatário (omitindo complemento vazio)', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ContractForm offer={result().offers[0]!} loading={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Contratar transportadora-sul · Rodoviário');
    await fill(user, 'Remetente', { Nome: 'Loja', Rua: 'Av. Paulista', 'Número': '1000', Cidade: 'São Paulo' });
    await fill(user, 'Destinatário', { Nome: 'Maria', Rua: 'Rua XV', 'Número': '10', Complemento: 'ap 3', Cidade: 'Curitiba' });
    await user.click(screen.getByRole('button', { name: 'Confirmar contratação' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { name: 'Loja', street: 'Av. Paulista', number: '1000', city: 'São Paulo' },
      { name: 'Maria', street: 'Rua XV', number: '10', complement: 'ap 3', city: 'Curitiba' },
    );
  });

  it('mostra "Grátis", cancela e desabilita durante envio', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ContractForm offer={result().offers[2]!} loading={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByText(/Grátis, 7 dias/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
    rerender(<ContractForm offer={result().offers[2]!} loading onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Contratando…' })).toBeDisabled();
  });
});
