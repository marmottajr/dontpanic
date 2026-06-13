import { BadRequestException, Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import sharp from 'sharp';
import type { AvatarResponse } from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/storage.provider';
import { sniffImageType } from '../support/image-sniff';

/** 5 MB — mirrors the @fastify/multipart limit registered in main.ts. */
const MAX_AVATAR_BYTES = 5_000_000;
const AVATAR_SIZE = 256;

@Injectable()
export class AvatarService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private avatarKey(userId: string): string {
    return `avatars/${userId}.webp`;
  }

  /**
   * Validate (size + real MIME via magic bytes), normalise to a 256x256 WebP,
   * upload via the storage port, and persist the public URL on the user.
   * Storage-driver-agnostic: works identically for s3 and local adapters.
   */
  async uploadAvatar(userId: string, input: Buffer): Promise<AvatarResponse> {
    if (input.length === 0) {
      throw new BadRequestException('No file received. An empty void is not a portrait.');
    }
    if (input.length > MAX_AVATAR_BYTES) {
      throw new PayloadTooLargeException('Avatar exceeds the 5MB limit.');
    }

    const detected = sniffImageType(input);
    if (!detected) {
      throw new BadRequestException('Unsupported image. Allowed: PNG, JPEG, WebP.');
    }

    let webp: Buffer;
    try {
      webp = await sharp(input)
        .rotate() // honour EXIF orientation before stripping metadata
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      // Magic bytes matched but the payload is malformed/corrupt.
      throw new BadRequestException('That image could not be processed.');
    }

    const key = this.avatarKey(userId);
    const { url } = await this.storage.putObject({
      key,
      body: webp,
      contentType: 'image/webp',
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    return { avatarUrl: url };
  }

  /** Remove the stored object (best-effort) and null the column. */
  async deleteAvatar(userId: string): Promise<AvatarResponse> {
    await this.storage.deleteObject(this.avatarKey(userId));
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });
    return { avatarUrl: null };
  }
}
