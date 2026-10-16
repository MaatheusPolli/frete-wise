import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuoteForm } from '../src/components/QuoteForm';

describe('<QuoteForm />', () => {
  it('envia CEPs e itens convertendo reais para centavos', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QuoteForm onSubmit={onSubmit} loading={false} />);

    const origem = screen.getByLabelText('CEP origem');
    await user.clear(origem);
    await user.type(origem, '20000-000');
    const peso = screen.getByLabelText('Peso (g)');
    await user.clear(peso);
    await user.type(peso, '2500');
    const valor = screen.getByLabelText('Valor (R$)');
    await user.clear(valor);
    await user.type(valor, '99.9');
    for (const [label, v] of [['Comprimento (cm)', '40'], ['Largura (cm)', '30'], ['Altura (cm)', '20'], ['Quantidade', '2']] as const) {
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), v);
    }
    await user.click(screen.getByRole('button', { name: 'Cotar frete' }));

    expect(onSubmit).toHaveBeenCalledWith({
      origin: { cep: '20000-000' },
      destination: { cep: '80010-000' },
      items: [{ weightGrams: 2500, lengthCm: 40, widthCm: 30, heightCm: 20, quantity: 2, valueCents: 9990 }],
    });
  });

  it('adiciona e remove itens, sem permitir remover o último', async () => {
    const user = userEvent.setup();
    render(<QuoteForm onSubmit={vi.fn()} loading={false} />);
    const removers = () => screen.getAllByRole('button', { name: 'Remover item' });
    expect(removers()[0]).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '+ adicionar item' }));
    expect(removers()).toHaveLength(2);
    expect(removers()[0]).toBeEnabled();
    await user.click(removers()[1]!);
    expect(removers()).toHaveLength(1);
  });

  it('desabilita o botão durante o carregamento', () => {
    render(<QuoteForm onSubmit={vi.fn()} loading />);
    expect(screen.getByRole('button', { name: 'Cotando…' })).toBeDisabled();
  });
});
