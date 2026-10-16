import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderStatus } from '../src/components/ProviderStatus';
import { jsonResponse, providers } from './fixtures';

describe('<ProviderStatus />', () => {
  it('mostra estado do breaker, latência e contadores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ providers })));
    render(<ProviderStatus refreshKey={0} />);
    expect(await screen.findByText('correios')).toBeInTheDocument();
    expect(screen.getByText(/breaker fechado · 7 ms · 3 chamadas · 0 falhas/)).toBeInTheDocument();
    expect(screen.getByText(/breaker aberto · 3000 ms/)).toBeInTheDocument();
    expect(screen.getByText(/breaker meio-aberto/)).toBeInTheDocument();
  });

  it('avisa quando a API está indisponível e atualiza a cada 5 s', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(jsonResponse({ providers }));
      vi.stubGlobal('fetch', fetchMock);
      render(<ProviderStatus refreshKey={0} />);
      await act(async () => {});
      expect(screen.getByText('API indisponível')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('API indisponível')).not.toBeInTheDocument();
      expect(screen.getByText('expresso')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('recarrega quando refreshKey muda e para o polling ao desmontar', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ providers }));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender, unmount } = render(<ProviderStatus refreshKey={0} />);
    await screen.findByText('correios');
    rerender(<ProviderStatus refreshKey={1} />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });
});
