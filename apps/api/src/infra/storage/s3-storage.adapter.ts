import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type {
  PutObjectInput,
  StorageProvider,
} from '../../core/storage/storage.provider';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  publicUrl: string;
}

/** Works with AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces — any S3-compatible. */
export class S3StorageAdapter implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }

  async putObject(input: PutObjectInput): Promise<{ key: string; url: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key: input.key, url: this.getPublicUrl(input.key) };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }

  getPublicUrl(key: string): string {
    return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}
