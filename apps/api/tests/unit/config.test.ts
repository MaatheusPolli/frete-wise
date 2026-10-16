import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('config', () => {
  it('aplica defaults', () => {
    const c = loadConfig({});
    expect(c.PROVIDER_TIMEOUT_MS).toBe(3000);
    expect(c.PORT).toBe(3000);
  });
  it('falha rápido com env inválido', () => {
    expect(() => loadConfig({ PROVIDER_TIMEOUT_MS: 'abc' })).toThrow(/Configuração inválida/);
  });
});
