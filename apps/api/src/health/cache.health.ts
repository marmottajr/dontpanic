import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { CACHE_PROVIDER, type CacheProvider } from '../core/cache/cache.provider';

/** Terminus indicator that pings the cache backend (Redis) for /health. */
@Injectable()
export class CacheHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.cache.ping();
      return indicator.up();
    } catch (err) {
      return indicator.down({ message: err instanceof Error ? err.message : String(err) });
    }
  }
}
