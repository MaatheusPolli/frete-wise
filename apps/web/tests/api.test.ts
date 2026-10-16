import { describe, expect, it, vi } from 'vitest';
import { formatMoney, getProviders, postQuote } from '../src/api';
import { jsonResponse, providers, result } from './fixtures';

const body = { origin: { cep: '01310-100' }, destination: { cep: '80010-000' }, items: [] };

describe('api client', () => {
  it('formata centavos em BRL', () => {
    expect(formatMoney(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });

  it('postQuote envia JSON e devolve o resultado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(result()));
    vi.stubGlobal('fetch', fetchMock);
    const res = await postQuote(body);
    expect(res.offers).toHaveLength(3);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/cotacoes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it('postQuote junta mensagens de validação', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ issues: [{ message: 'CEP inválido' }, { message: 'x' }] }, 400)));
    await expect(postQuote(body)).rejects.toThrow('CEP inválido; x');
  });

  it('postQuote usa status quando a resposta de erro não é JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));
    await expect(postQuote(body)).rejects.toThrow('Erro 502');
  });

  it('getProviders devolve a lista e trata erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ providers })).mockResolvedValueOnce(new Response('', { status: 500 })));
    expect(await getProviders()).toEqual(providers);
    await expect(getProviders()).rejects.toThrow('Erro 500');
  });
});
