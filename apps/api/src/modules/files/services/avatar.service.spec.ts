import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

// sharp is mocked: a chainable builder whose toBuffer() yields our fake webp.
const toBuffer = jest.fn();
const sharpInstance = {
  rotate: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer,
};
const sharpFactory = jest.fn(() => sharpInstance);

jest.mock('sharp', () => ({
  __esModule: true,
  default: sharpFactory,
}));

import { AvatarService } from './avatar.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBP_OUT = Buffer.from('processed-webp');

describe('AvatarService', () => {
  let prisma: { user: { update: jest.Mock } };
  let storage: { putObject: jest.Mock; deleteObject: jest.Mock; getPublicUrl: jest.Mock };
  let service: AvatarService;

  beforeEach(() => {
    sharpFactory.mockClear();
    sharpInstance.rotate.mockClear().mockReturnThis();
    sharpInstance.resize.mockClear().mockReturnThis();
    sharpInstance.webp.mockClear().mockReturnThis();
    toBuffer.mockReset().mockResolvedValue(WEBP_OUT);

    prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    storage = {
      putObject: jest.fn().mockResolvedValue({
        key: 'avatars/u1.webp',
        url: 'http://cdn/avatars/u1.webp',
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getPublicUrl: jest.fn(),
    };
    service = new AvatarService(prisma as never, storage as never);
  });

  describe('uploadAvatar', () => {
    it('rejects an empty buffer', async () => {
      await expect(service.uploadAvatar('u1', Buffer.alloc(0))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sharpFactory).not.toHaveBeenCalled();
    });

    it('rejects a payload over the 5MB limit', async () => {
      const tooBig = Buffer.alloc(5_000_001);
      // Stamp PNG magic so the size check (not the sniffer) is what trips.
      PNG.copy(tooBig);
      await expect(service.uploadAvatar('u1', tooBig)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
    });

    it('rejects an unsupported / spoofed image (bad magic bytes)', async () => {
      await expect(
        service.uploadAvatar('u1', Buffer.from('definitely not an image')),
      ).rejects.toThrow('Unsupported image. Allowed: PNG, JPEG, WebP.');
      expect(sharpFactory).not.toHaveBeenCalled();
    });

    it('wraps a sharp processing failure as BadRequest', async () => {
      toBuffer.mockRejectedValueOnce(new Error('corrupt pixels'));
      await expect(service.uploadAvatar('u1', PNG)).rejects.toThrow(
        'That image could not be processed.',
      );
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it('processes, uploads and persists the avatar url on success', async () => {
      const res = await service.uploadAvatar('u1', PNG);

      // sharp pipeline: rotate -> resize 256 cover -> webp.
      expect(sharpFactory).toHaveBeenCalledWith(PNG);
      expect(sharpInstance.rotate).toHaveBeenCalled();
      expect(sharpInstance.resize).toHaveBeenCalledWith(
        256,
        256,
        expect.objectContaining({ fit: 'cover' }),
      );
      expect(sharpInstance.webp).toHaveBeenCalled();

      expect(storage.putObject).toHaveBeenCalledWith({
        key: 'avatars/u1.webp',
        body: WEBP_OUT,
        contentType: 'image/webp',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { avatarUrl: 'http://cdn/avatars/u1.webp' },
      });
      expect(res).toEqual({ avatarUrl: 'http://cdn/avatars/u1.webp' });
    });
  });

  describe('deleteAvatar', () => {
    it('removes the stored object and nulls the column', async () => {
      const res = await service.deleteAvatar('u1');
      expect(storage.deleteObject).toHaveBeenCalledWith('avatars/u1.webp');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { avatarUrl: null },
      });
      expect(res).toEqual({ avatarUrl: null });
    });
  });
});
