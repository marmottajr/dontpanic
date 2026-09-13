import { localStaticPrefix } from './local-static';

describe('localStaticPrefix', () => {
  it('takes the path out of an absolute url', () => {
    expect(localStaticPrefix('http://localhost:4201/files')).toBe('/files');
  });

  it('accepts a path-only value (reverse proxy already routes the host)', () => {
    expect(localStaticPrefix('/uploads')).toBe('/uploads');
  });

  it('normalises missing and trailing slashes', () => {
    expect(localStaticPrefix('files/')).toBe('/files');
    expect(localStaticPrefix('  http://cdn.local/a/b//  ')).toBe('/a/b');
  });

  it('keeps nested paths', () => {
    expect(localStaticPrefix('https://app.example.com/static/files')).toBe('/static/files');
  });

  it('refuses the root, which would shadow every API route', () => {
    expect(() => localStaticPrefix('http://localhost:4201')).toThrow(/must contain a path/);
    expect(() => localStaticPrefix('/')).toThrow(/must contain a path/);
  });
});
