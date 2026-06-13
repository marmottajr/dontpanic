import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { STORAGE_PROVIDER } from '../../core/storage/storage.provider';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (config.get('STORAGE_DRIVER', { infer: true }) === 'local') {
          return new LocalStorageAdapter({
            dir: config.get('LOCAL_STORAGE_DIR', { infer: true }),
            publicUrl: config.get('LOCAL_STORAGE_PUBLIC_URL', { infer: true }),
          });
        }
        return new S3StorageAdapter({
          endpoint: config.get('S3_ENDPOINT', { infer: true }),
          region: config.get('S3_REGION', { infer: true }),
          bucket: config.get('S3_BUCKET', { infer: true }),
          accessKey: config.get('S3_ACCESS_KEY', { infer: true }),
          secretKey: config.get('S3_SECRET_KEY', { infer: true }),
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
          publicUrl: config.get('S3_PUBLIC_URL', { infer: true }),
        });
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
