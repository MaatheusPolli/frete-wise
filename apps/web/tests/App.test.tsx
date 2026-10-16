import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { jsonResponse, providers, result, shipment, tracking } from './fixtures';

function mockApi(quote: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith('/provedores') ? jsonResponse({ providers }) : url.includes('/envios?') ? jsonResponse({ total: 0, items: [] }) : quote());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('<App />', () => {
  it('fluxo completo: cotar exibe a tabela e atualiza o status dos provedores', async () => {
    const fetchMock = mockApi(() => jsonResponse(result()));
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'FreteWise' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cotar frete' }));
    expect(await screen.findByRole('heading', { name: 'Opções de frete' })).toBeInTheDocument();
    expect(screen.getByText('mais barato')).toBeInTheDocument();
    const provedoresCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/provedores'));
    expect(provedoresCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('mostra erro de validação vindo da API', async () => {
    mockApi(() => jsonResponse({ issues: [{ message: 'CEP inválido' }] }, 400));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Cotar frete' }));
    expect(await screen.findByText('CEP inválido')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('trata falha de rede não-Error', async () => {
    mockApi(() => Promise.reject('sem rede'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Cotar frete' }));
    expect(await screen.findByText('sem rede')).toBeInTheDocument();
  });

  it('contrata uma oferta e passa a rastrear o envio', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/provedores')) return jsonResponse({ providers });
      if (url.includes('/envios?')) return jsonResponse({ total: 1, items: [{ ...shipment, createdAt: '2026-01-05T12:00:00.000Z', recipient: { name: 'Maria', street: 'R', number: '1', city: 'C' }, destination: { cep: '80010000', uf: 'PR' } }] });
      if (url.endsWith('/cotacoes')) return jsonResponse(result());
      if (url.endsWith('/envios')) return init && JSON.parse(String(init.body)).recipient.name === 'Erro'
        ? jsonResponse({ error: 'OFFER_UNAVAILABLE', message: 'Oferta indisponível' }, 422)
        : jsonResponse(shipment, 201);
      return jsonResponse(tracking);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Cotar frete' }));
    await user.click(await screen.findByRole('button', { name: 'Contratar correios PAC' }));

    const fill = async (name: string) => {
      for (const who of ['Remetente', 'Destinatário']) {
        const nome = screen.getByLabelText(`${who} - Nome`);
        await user.clear(nome);
        await user.type(nome, name);
        for (const f of ['Rua', 'Número', 'Cidade']) {
          const el = screen.getByLabelText(`${who} - ${f}`);
          await user.clear(el);
          await user.type(el, 'x');
        }
      }
      await user.click(screen.getByRole('button', { name: 'Confirmar contratação' }));
    };

    await fill('Erro');
    expect(await screen.findByText('Oferta indisponível')).toBeInTheDocument();

    await fill('Maria');
    expect(await screen.findByText(/Frete contratado/)).toHaveTextContent('OB000000015BR');
    expect(screen.queryByRole('button', { name: 'Confirmar contratação' })).not.toBeInTheDocument();
    const body = JSON.parse(String(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/envios')).at(-1)![1]!.body));
    expect(body).toMatchObject({ providerId: 'correios', service: 'PAC', origin: { cep: '01310-100' }, recipient: { name: 'Maria' } });
    expect(await screen.findByText('Objeto em trânsito')).toBeInTheDocument();

    // rastrear pelo histórico (persistido) — duas vezes o mesmo código refaz a consulta
    const trackCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/rastreamento/')).length;
    const before = trackCalls();
    await user.click(await screen.findByRole('button', { name: 'Rastrear OB000000015BR' }));
    await user.click(screen.getByRole('button', { name: 'Rastrear OB000000015BR' }));
    await vi.waitFor(() => expect(trackCalls()).toBe(before + 2));

    await user.click(screen.getByRole('button', { name: 'Contratar correios SEDEX' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Confirmar contratação' })).not.toBeInTheDocument();
  });
});
