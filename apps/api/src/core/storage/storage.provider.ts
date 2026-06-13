export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Port for object storage. Uploads go through the API (so we can validate MIME
 * and generate thumbnails), keeping the interface identical for S3 and local.
 */
export interface StorageProvider {
  putObject(input: PutObjectInput): Promise<{ key: string; url: string }>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
