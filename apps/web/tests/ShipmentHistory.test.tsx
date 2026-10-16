import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShipmentHistory } from '../src/components/ShipmentHistory';
import { jsonResponse, shipment } from './fixtures';

const item = (over = {}) => ({
  ...shipment, createdAt: '2026-01-05T12:00:00.000Z', recipient: { name: 'Maria', street: 'R', number: '1', city: 'Curitiba' },
  destination: { cep: '80010000', uf: 'PR' }, ...over,
});

describe('<ShipmentHistory />', () => {
  it('lista envios persistidos e aciona o rastreamento', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      total: 12, items: [item(), item({ trackingCode: 'FW000000025BR', price: 0, destination: { cep: '80010000' } })],
    })));
    const onTrack = vi.fn();
    const user = userEvent.setup();
    render(<ShipmentHistory refreshKey={0} onTrack={onTrack} />);
    expect(await screen.findByText('(12 no total)')).toBeInTheDocument();
    expect(screen.getByText(/correios PAC · Maria · PR · R\$\s32,43/)).toBeInTheDocument();
    expect(screen.getByText(/80010000 · Grátis/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rastrear FW000000025BR' }));
    expect(onTrack).toHaveBeenCalledWith('FW000000025BR');
  });

  it('estado vazio e erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ total: 0, items: [] })).mockResolvedValueOnce(new Response('', { status: 500 })));
    const { rerender } = render(<ShipmentHistory refreshKey={0} onTrack={vi.fn()} />);
    expect(await screen.findByText('Nenhum envio contratado ainda.')).toBeInTheDocument();
    rerender(<ShipmentHistory refreshKey={1} onTrack={vi.fn()} />);
    expect(await screen.findByText('Não foi possível carregar os envios.')).toBeInTheDocument();
  });
});
