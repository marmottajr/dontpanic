const send = jest.fn();
const S3Client = jest.fn().mockImplementation(() => ({ send }));
const PutObjectCommand = jest.fn().mockImplementation((input: unknown) => ({ __type: 'put', input }));
const DeleteObjectCommand = jest
  .fn()
  .mockImplementation((input: unknown) => ({ __type: 'delete', input }));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
}));

import { S3StorageAdapter, type S3Config } from './s3-storage.adapter';

const baseConfig: S3Config = {
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  bucket: 'dontpanic',
  accessKey: 'key',
  secretKey: 'secret',
  forcePathStyle: true,
  publicUrl: 'http://cdn.local/dontpanic',
};

describe('S3StorageAdapter', () => {
  let adapter: S3StorageAdapter;

  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    S3Client.mockClear();
    PutObjectCommand.mockClear();
    DeleteObjectCommand.mockClear();
    adapter = new S3StorageAdapter(baseConfig);
  });

  it('configures the client with endpoint, region, path style and credentials', () => {
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://minio:9000',
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
      }),
    );
  });

  it('putObject uploads and returns key + public url', async () => {
    const body = Buffer.from('img');
    const res = await adapter.putObject({ key: 'avatars/1.webp', body, contentType: 'image/webp' });

    expect(res).toEqual({ key: 'avatars/1.webp', url: 'http://cdn.local/dontpanic/avatars/1.webp' });
    const input = PutObjectCommand.mock.calls[0][0];
    expect(input).toEqual({
      Bucket: 'dontpanic',
      Key: 'avatars/1.webp',
      Body: body,
      ContentType: 'image/webp',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('deleteObject sends a DeleteObjectCommand', async () => {
    await adapter.deleteObject('avatars/1.webp');
    expect(DeleteObjectCommand.mock.calls[0][0]).toEqual({
      Bucket: 'dontpanic',
      Key: 'avatars/1.webp',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('getPublicUrl strips a trailing slash from the base', () => {
    const a = new S3StorageAdapter({ ...baseConfig, publicUrl: 'http://cdn.local/dontpanic/' });
    expect(a.getPublicUrl('k.png')).toBe('http://cdn.local/dontpanic/k.png');
  });

  it('propagates an upload failure', async () => {
    send.mockRejectedValueOnce(new Error('s3 unreachable'));
    await expect(
      adapter.putObject({ key: 'k', body: Buffer.from('x'), contentType: 'image/webp' }),
    ).rejects.toThrow('s3 unreachable');
  });
});
