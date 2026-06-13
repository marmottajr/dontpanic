import type { CacheProvider } from '../../core/cache/cache.provider';

interface Entry {
  value: string;
  expiresAt: number | null;
}

/** In-process cache for tests / single-instance dev. Not for multi-node prod. */
export class MemoryCacheAdapter implements CacheProvider {
  private readonly store = new Map<string, Entry>();

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const current = await this.get(key);
    const next = (current ? Number(current) : 0) + 1;
    const existing = this.store.get(key);
    const expiresAt =
      existing && !this.isExpired(existing)
        ? existing.expiresAt
        : ttlSeconds
          ? Date.now() + ttlSeconds * 1000
          : null;
    this.store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry) || entry.expiresAt === null) return 0;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  async ping(): Promise<void> {
    // In-process cache is always reachable.
  }
}
