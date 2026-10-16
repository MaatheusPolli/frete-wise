import { z } from 'zod';
import { normalizeCep, type Address } from '../domain/quote.js';
import { fetchJson } from './http.js';
import { ufFromCep } from '../domain/regions.js';

const ViaCepSchema = z.object({ uf: z.string().length(2), localidade: z.string() });

export interface CepResolver {
  resolve(cep: string): Promise<Address>;
}

/**
 * Integração real com ViaCEP. Se a API cair ou demorar, cai para a faixa de CEP
 * (tabela estática) — resolver região nunca derruba a cotação.
 */
export class ViaCepResolver implements CepResolver {
  private readonly memo = new Map<string, Address>();

  constructor(private readonly baseUrl: string, private readonly timeoutMs: number) {}

  async resolve(rawCep: string): Promise<Address> {
    const cep = normalizeCep(rawCep);
    const hit = this.memo.get(cep);
    if (hit) return hit;
    try {
      const data = await fetchJson(`${this.baseUrl}/${cep}/json/`, { signal: AbortSignal.timeout(this.timeoutMs) });
      const parsed = ViaCepSchema.parse(data);
      const address = { cep, uf: parsed.uf.toUpperCase(), city: parsed.localidade };
      this.memo.set(cep, address);
      return address;
    } catch {
      return { cep, uf: ufFromCep(cep) };
    }
  }
}

/** Usado em testes/offline. */
export class StaticCepResolver implements CepResolver {
  async resolve(rawCep: string): Promise<Address> {
    const cep = normalizeCep(rawCep);
    return { cep, uf: ufFromCep(cep) };
  }
}
