import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { AvatarService } from './services/avatar.service';

/**
 * Files: avatar upload via the StorageProvider port. Validates the real MIME
 * type by sniffing magic bytes, normalises to a 256x256 WebP with sharp, and
 * stays storage-driver-agnostic (works for both s3 and local adapters).
 * Routes are protected by the global JwtAuthGuard.
 */
@Module({
  controllers: [FilesController],
  providers: [AvatarService],
})
export class FilesModule {}
