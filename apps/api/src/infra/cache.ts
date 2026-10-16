export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  close?(): Promise<void>;
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now, private readonly maxEntries = 10_000) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) return;
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }
}

/** Implementação Redis — mesma interface; carregada só quando REDIS_URL existe. */
export class RedisCache implements Cache {
  private constructor(private readonly client: import('ioredis').Redis) {}

  static async connect(url: string): Promise<RedisCache> {
    const { Redis } = await import('ioredis');
    return new RedisCache(new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1 }));
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined; // cache nunca derruba a cotação
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
    } catch {
      /* ignora */
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
