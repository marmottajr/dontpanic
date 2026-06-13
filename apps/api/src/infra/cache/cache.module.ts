import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { CACHE_PROVIDER } from '../../core/cache/cache.provider';
import { MemoryCacheAdapter } from './memory-cache.adapter';
import { RedisCacheAdapter } from './redis-cache.adapter';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('CACHE_DRIVER', { infer: true }) === 'memory'
          ? new MemoryCacheAdapter()
          : new RedisCacheAdapter(config.get('REDIS_URL', { infer: true })),
    },
  ],
  exports: [CACHE_PROVIDER],
})
export class CacheModule {}
