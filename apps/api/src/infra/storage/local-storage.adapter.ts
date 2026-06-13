import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  PutObjectInput,
  StorageProvider,
} from '../../core/storage/storage.provider';

export interface LocalConfig {
  dir: string;
  publicUrl: string;
}

/** Filesystem storage for dev/test. Serve `dir` statically to expose publicUrl. */
export class LocalStorageAdapter implements StorageProvider {
  constructor(private readonly config: LocalConfig) {}

  async putObject(input: PutObjectInput): Promise<{ key: string; url: string }> {
    const filePath = join(this.config.dir, input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
    return { key: input.key, url: this.getPublicUrl(input.key) };
  }

  async deleteObject(key: string): Promise<void> {
    await rm(join(this.config.dir, key), { force: true });
  }

  getPublicUrl(key: string): string {
    return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}
