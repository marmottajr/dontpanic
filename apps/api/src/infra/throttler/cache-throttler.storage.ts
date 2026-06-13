import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { CACHE_PROVIDER, type CacheProvider } from '../../core/cache/cache.provider';

/** The record shape ThrottlerStorage.increment must return (not re-exported by name). */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * A ThrottlerStorage backed by the app's CacheProvider, so rate-limit counters
 * live wherever CACHE_DRIVER points: Redis in prod (shared across instances) or
 * the in-memory adapter in tests. Fixed-window — counts hits per key within the
 * window and reports blocked once the limit is exceeded, until the window rolls.
 */
@Injectable()
export class CacheThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(CACHE_PROVIDER) private readonly cache: CacheProvider) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));
    const storageKey = `throttle:${throttlerName}:${key}`;
    const totalHits = await this.cache.incr(storageKey, ttlSeconds);
    const timeToExpire = (await this.cache.ttl(storageKey)) || ttlSeconds;
    const isBlocked = totalHits > limit;
    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
