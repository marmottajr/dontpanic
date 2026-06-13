import { OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { CacheProvider } from '../../core/cache/cache.provider';

export class RedisCacheAdapter implements CacheProvider, OnModuleDestroy {
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1 && ttlSeconds) {
      await this.client.expire(key, ttlSeconds);
    }
    return value;
  }

  async ttl(key: string): Promise<number> {
    const ms = await this.client.pttl(key); // -2 missing, -1 no expiry
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
