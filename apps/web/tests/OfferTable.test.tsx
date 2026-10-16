import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfferTable } from '../src/components/OfferTable';
import { result } from './fixtures';

describe('<OfferTable />', () => {
  it('lista as ofertas na ordem recebida com badges e breakdown', () => {
    render(<OfferTable result={result()} elapsedMs={81} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('mais barato')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('mais rápido')).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText('mais rápido')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Ad valorem/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1 dia')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Grátis')).toBeInTheDocument();
    expect(screen.getByText(/81 ms/)).toHaveTextContent('id 12345678');
  });

  it('mostra aviso de resultado parcial com as falhas', () => {
    render(
      <OfferTable
        result={result({ failures: [{ providerId: 'expresso', code: 'TIMEOUT', reason: 'Timeout após 3000ms' }] })}
        elapsedMs={null}
      />,
    );
    expect(screen.getByText('Resultado parcial.')).toBeInTheDocument();
    expect(screen.getByText('expresso')).toBeInTheDocument();
    expect(screen.getByText(/TIMEOUT: Timeout após 3000ms/)).toBeInTheDocument();
  });

  it('indica cache e ausência de ofertas', () => {
    render(<OfferTable result={result({ offers: [], cached: true, cheapest: undefined, fastest: undefined })} elapsedMs={5} />);
    expect(screen.getByText('Nenhuma opção disponível para esta rota.')).toBeInTheDocument();
    expect(screen.getByText(/do cache/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
