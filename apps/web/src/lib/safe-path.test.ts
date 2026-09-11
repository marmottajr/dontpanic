import { describe, it, expect } from 'vitest';
import { safeInternalPath } from './safe-path';

const ORIGIN = 'https://app.dontpanic.dev';

/**
 * The login's `?from=` comes from the address bar. An attacker sends a link to
 * OUR login and, if the destination isn't validated, the victim signs in with
 * their credentials and lands on the attacker's site — carrying the trust of
 * having come from a domain they know.
 */
describe('safeInternalPath', () => {
  it('lets an internal path through, query and hash included', () => {
    expect(safeInternalPath('/profile', ORIGIN)).toBe('/profile');
    expect(safeInternalPath('/admin?page=2#top', ORIGIN)).toBe('/admin?page=2#top');
  });

  it('rejects the shapes the browser reads as an absolute URL', () => {
    // Each of these starts with a slash and would leave the domain. That's why
    // validation stopped matching patterns and now resolves against the origin.
    for (const hostile of [
      '//evil.com',
      '///evil.com',
      '/\\evil.com', // Chrome normalises `\` to `/` in the authority position
      '\\\\evil.com',
      'https://evil.com',
      'http://evil.com/x',
      '//evil.com/@app.dontpanic.dev',
    ]) {
      expect(safeInternalPath(hostile, ORIGIN)).toBeNull();
    }
  });

  it('rejects schemes that execute code', () => {
    expect(safeInternalPath('javascript:alert(1)', ORIGIN)).toBeNull();
    expect(safeInternalPath('data:text/html,<script>', ORIGIN)).toBeNull();
  });

  it('an invalid origin returns null instead of blowing up the page', () => {
    // `new URL` throws with a base that isn't a URL. It happens in environments
    // without a real `location`; the login must not go down over it.
    expect(safeInternalPath('/profile', 'not-an-origin')).toBeNull();
  });

  it('with no destination, it invents none', () => {
    expect(safeInternalPath(null, ORIGIN)).toBeNull();
    expect(safeInternalPath('', ORIGIN)).toBeNull();
    expect(safeInternalPath(undefined, ORIGIN)).toBeNull();
  });
});
