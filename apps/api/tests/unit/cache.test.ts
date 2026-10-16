import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../../src/infra/cache.js';

describe('MemoryCache', () => {
  it('expira por TTL', async () => {
    let now = 0;
    const c = new MemoryCache(() => now);
    await c.set('k', { a: 1 }, 100);
    expect(await c.get('k')).toEqual({ a: 1 });
    now = 100;
    expect(await c.get('k')).toBeUndefined();
    expect(await c.get('x')).toBeUndefined();
  });
  it('ttl 0 não grava e respeita limite de entradas', async () => {
    const c = new MemoryCache(Date.now, 2);
    await c.set('z', 1, 0);
    expect(await c.get('z')).toBeUndefined();
    await c.set('a', 1, 1000); await c.set('b', 2, 1000); await c.set('c', 3, 1000);
    expect(await c.get('a')).toBeUndefined();
    expect(await c.get('c')).toBe(3);
  });
});
