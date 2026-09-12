import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCookie, readCookie } from './cookies';

/** jsdom keeps a real cookie jar, so set-then-read exercises the actual parse. */
function seed(raw: string): void {
  document.cookie = raw;
}

afterEach(() => {
  // Unstub FIRST. The server-render cases replace `document` with undefined,
  // and a cleanup that reaches for `document.cookie` before restoring it
  // throws — taking down not this test but every one that runs after it.
  vi.unstubAllGlobals();
  for (const part of document.cookie.split('; ')) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
});

describe('readCookie', () => {
  it('reads a value', () => {
    seed('dp_2fa_ticket=abc123; Path=/');
    expect(readCookie('dp_2fa_ticket')).toBe('abc123');
  });

  it('returns null for a cookie that is not set', () => {
    expect(readCookie('nothing_here')).toBeNull();
  });

  it('picks the right one out of several', () => {
    seed('first=one; Path=/');
    seed('dp_2fa_ticket=two; Path=/');
    seed('third=three; Path=/');
    expect(readCookie('dp_2fa_ticket')).toBe('two');
  });

  // The failure this prevents: `readCookie('tick')` matching `ticket=…`
  // because the name was compared as a bare prefix rather than up to the `=`.
  it('does not match a cookie whose name merely starts the same', () => {
    seed('ticket_other=nope; Path=/');
    expect(readCookie('ticket')).toBeNull();
  });

  it('decodes percent-encoding', () => {
    seed(`spaced=${encodeURIComponent('a b/c')}; Path=/`);
    expect(readCookie('spaced')).toBe('a b/c');
  });

  it('answers null rather than raw bytes when the value is not valid encoding', () => {
    seed('broken=%E0%A4%A; Path=/');
    expect(readCookie('broken')).toBeNull();
  });

  it('is safe where there is no document (server render)', () => {
    vi.stubGlobal('document', undefined);
    expect(readCookie('anything')).toBeNull();
  });
});

describe('clearCookie', () => {
  it('removes the cookie', () => {
    seed('dp_2fa_ticket=abc123; Path=/');
    expect(readCookie('dp_2fa_ticket')).toBe('abc123');

    clearCookie('dp_2fa_ticket');
    expect(readCookie('dp_2fa_ticket')).toBeNull();
  });

  it('leaves the others alone', () => {
    seed('keep=me; Path=/');
    seed('drop=me; Path=/');

    clearCookie('drop');
    expect(readCookie('keep')).toBe('me');
    expect(readCookie('drop')).toBeNull();
  });

  it('is safe where there is no document (server render)', () => {
    vi.stubGlobal('document', undefined);
    expect(() => clearCookie('anything')).not.toThrow();
  });
});
