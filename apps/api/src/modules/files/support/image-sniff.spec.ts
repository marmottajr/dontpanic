import { sniffImageType } from './image-sniff';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function webpBuffer(): Buffer {
  const b = Buffer.alloc(16);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(8, 4); // file size field (ignored by sniffer)
  b.write('WEBP', 8, 'ascii');
  return b;
}

describe('sniffImageType', () => {
  it('detects PNG by its 8-byte signature', () => {
    expect(sniffImageType(Buffer.concat([PNG_MAGIC, Buffer.from('rest')]))).toBe('png');
  });

  it('detects JPEG by FF D8 FF', () => {
    expect(sniffImageType(JPEG_MAGIC)).toBe('jpeg');
  });

  it('detects WebP by RIFF....WEBP', () => {
    expect(sniffImageType(webpBuffer())).toBe('webp');
  });

  it('rejects a GIF (not an allowed format)', () => {
    expect(sniffImageType(Buffer.from('GIF89a-rest-bytes'))).toBeNull();
  });

  it('rejects an arbitrary / text payload', () => {
    expect(sniffImageType(Buffer.from('hello this is not an image'))).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it('rejects a truncated PNG signature', () => {
    expect(sniffImageType(PNG_MAGIC.subarray(0, 4))).toBeNull();
  });

  it('rejects a RIFF container that is not WEBP (e.g. WAV)', () => {
    const wav = Buffer.alloc(16);
    wav.write('RIFF', 0, 'ascii');
    wav.write('WAVE', 8, 'ascii');
    expect(sniffImageType(wav)).toBeNull();
  });

  it('does not misread a JPEG-like prefix that is too short', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
