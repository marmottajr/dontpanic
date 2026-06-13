import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from './local-storage.adapter';

describe('LocalStorageAdapter', () => {
  let dir: string;
  let adapter: LocalStorageAdapter;
  const publicUrl = 'http://localhost:3001/files';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dontpanic-storage-'));
    adapter = new LocalStorageAdapter({ dir, publicUrl });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the object to disk and returns key + public url', async () => {
    const body = Buffer.from('hello world');
    const result = await adapter.putObject({ key: 'a/b.txt', body, contentType: 'text/plain' });

    expect(result.key).toBe('a/b.txt');
    expect(result.url).toBe('http://localhost:3001/files/a/b.txt');
    const onDisk = await readFile(join(dir, 'a/b.txt'));
    expect(onDisk.equals(body)).toBe(true);
  });

  it('creates nested directories as needed', async () => {
    await adapter.putObject({
      key: 'deep/nested/path/file.bin',
      body: Buffer.from([1, 2, 3]),
      contentType: 'application/octet-stream',
    });
    const s = await stat(join(dir, 'deep/nested/path/file.bin'));
    expect(s.isFile()).toBe(true);
  });

  it('overwrites an existing object', async () => {
    await adapter.putObject({ key: 'f.txt', body: Buffer.from('one'), contentType: 'text/plain' });
    await adapter.putObject({ key: 'f.txt', body: Buffer.from('two'), contentType: 'text/plain' });
    expect((await readFile(join(dir, 'f.txt'))).toString()).toBe('two');
  });

  it('deletes an existing object', async () => {
    await adapter.putObject({ key: 'gone.txt', body: Buffer.from('x'), contentType: 'text/plain' });
    await adapter.deleteObject('gone.txt');
    await expect(stat(join(dir, 'gone.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('deleting a missing object does not throw (force: true)', async () => {
    await expect(adapter.deleteObject('never-existed.txt')).resolves.toBeUndefined();
  });

  describe('getPublicUrl', () => {
    it('joins the public url and key', () => {
      expect(adapter.getPublicUrl('avatars/1.webp')).toBe(
        'http://localhost:3001/files/avatars/1.webp',
      );
    });

    it('strips a trailing slash on the public url base', () => {
      const a = new LocalStorageAdapter({ dir, publicUrl: 'http://host/files/' });
      expect(a.getPublicUrl('k.png')).toBe('http://host/files/k.png');
    });
  });
});
