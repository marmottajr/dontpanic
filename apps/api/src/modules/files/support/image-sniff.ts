/**
 * Magic-byte sniffing for image uploads. We never trust a client-sent
 * Content-Type or filename extension — both are trivially spoofed. Instead we
 * read the first bytes of the buffer and match the real file signature.
 *
 * Allowed input formats: PNG, JPEG, WebP. (All are normalised to WebP later.)
 */
export type SniffedImageType = 'png' | 'jpeg' | 'webp';

/** Returns the detected image type, or null if it isn't an allowed image. */
export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // WebP: "RIFF" .... "WEBP" — bytes 0-3 = RIFF, bytes 8-11 = WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}
