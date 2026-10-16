import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrackingPanel } from '../src/components/TrackingPanel';
import { jsonResponse, shipment, tracking } from './fixtures';

describe('<TrackingPanel />', () => {
  it('após contratar, mostra código, link da etiqueta e linha do tempo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tracking));
    vi.stubGlobal('fetch', fetchMock);
    render(<TrackingPanel shipment={shipment} />);
    expect(screen.getByText('OB000000015BR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'baixar etiqueta (ZPL)' })).toHaveAttribute('href', '/api/envios/OB000000015BR/etiqueta');
    expect(await screen.findByText('Em trânsito')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('div')?.textContent)).toEqual(['Objeto em trânsito', 'Objeto postado']);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/rastreamento/OB000000015BR');
  });

  it('busca manual e mensagem de erro para código inexistente', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'NOT_FOUND', message: 'Envio XX não encontrado' }, 404))
      .mockResolvedValueOnce(jsonResponse({ ...tracking, status: 'ENTREGUE' })));
    const user = userEvent.setup();
    render(<TrackingPanel shipment={null} />);
    await user.type(screen.getByLabelText('Código de rastreio'), 'XX');
    await user.click(screen.getByRole('button', { name: 'Rastrear' }));
    expect(await screen.findByText('Envio XX não encontrado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rastrear' }));
    expect(await screen.findByText('Entregue')).toBeInTheDocument();
    expect(screen.queryByText('Envio XX não encontrado')).not.toBeInTheDocument();
  });

  it('erro não-Error vira texto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'));
    const user = userEvent.setup();
    render(<TrackingPanel shipment={null} />);
    await user.type(screen.getByLabelText('Código de rastreio'), 'AB');
    await user.click(screen.getByRole('button', { name: 'Rastrear' }));
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });
});
