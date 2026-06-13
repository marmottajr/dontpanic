/** Port for a key/value cache. Adapters: Redis (prod) and Memory (tests). */
export const CACHE_PROVIDER = Symbol('CACHE_PROVIDER');

export interface CacheProvider {
  get(key: string): Promise<string | null>;
  /** @param ttlSeconds optional time-to-live in seconds */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic increment; sets TTL on first write. Returns the new value. */
  incr(key: string, ttlSeconds?: number): Promise<number>;
  /** Remaining TTL of a key in seconds; 0 when missing or with no expiry set. */
  ttl(key: string): Promise<number>;
  /** Liveness probe for health checks; rejects if the backend is unreachable. */
  ping(): Promise<void>;
}
