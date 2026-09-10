import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { api as apiType, apiUpload as apiUploadType, ApiError as ApiErrorType } from './api';

/**
 * Helper to build a minimal Response-like object that the client's
 * `res.json()` / `res.text()` calls can consume.
 */
function jsonResponse(status: number, body: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => (text ? JSON.parse(text) : null),
    text: async () => text,
  } as Response;
}

const fetchMock = vi.fn();
const assignMock = vi.fn();

/** Stub window.location so redirectToLogin() is observable and inert. */
function stubLocation(pathname = '/dashboard', search = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, search, assign: assignMock },
  });
}

// The api module keeps an in-memory csrf token cache at module scope.
// Re-import it fresh for every test so the cache never leaks between cases.
let api: typeof apiType;
let apiUpload: typeof apiUploadType;
let ApiError: typeof ApiErrorType;

beforeEach(async () => {
  fetchMock.mockReset();
  assignMock.mockReset();
  stubLocation();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  const mod = await import('./api');
  api = mod.api;
  apiUpload = mod.apiUpload;
  ApiError = mod.ApiError;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api()', () => {
  it('GET does not request a csrf token nor send x-csrf-token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const data = await api<{ ok: boolean }>('/users/me');

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/users/me');
    expect(init.method).toBe('GET');
    // no csrf endpoint was hit
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/auth/csrf')).toBe(false);
    // no csrf header on a GET
    expect(init.headers['x-csrf-token']).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('a mutation fetches /api/auth/csrf first then sends x-csrf-token', async () => {
    // 1st call: csrf fetch, 2nd call: the actual POST
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'tok-123' }))
      .mockResolvedValueOnce(jsonResponse(200, { created: true }));

    const data = await api<{ created: boolean }>('/users', {
      method: 'POST',
      body: { name: 'Ford' },
    });

    expect(data).toEqual({ created: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/csrf');

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/users');
    expect(init.method).toBe('POST');
    expect(init.headers['x-csrf-token']).toBe('tok-123');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Ford' }));
  });

  it('caches the csrf token across mutations (only fetches it once)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'cached-tok' }))
      .mockResolvedValueOnce(jsonResponse(200, { a: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { b: 2 }));

    await api('/things', { method: 'POST', body: {} });
    await api('/things', { method: 'POST', body: {} });

    const csrfCalls = fetchMock.mock.calls.filter(([u]) => u === '/api/auth/csrf');
    expect(csrfCalls).toHaveLength(1);
  });

  it('a 401 on a non-/auth path triggers a single /api/auth/refresh then retries', async () => {
    fetchMock
      // GET -> 401
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      // refresh needs csrf -> csrf fetch
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'r-tok' }))
      // refresh POST -> ok
      .mockResolvedValueOnce(jsonResponse(200, { refreshed: true }))
      // retried GET -> ok
      .mockResolvedValueOnce(jsonResponse(200, { secret: 42 }));

    const data = await api<{ secret: number }>('/users/me');

    expect(data).toEqual({ secret: 42 });

    const urls = fetchMock.mock.calls.map(([u]) => u);
    expect(urls).toEqual(['/api/users/me', '/api/auth/csrf', '/api/auth/refresh', '/api/users/me']);
    // refresh is a POST carrying the csrf token
    const refreshInit = fetchMock.mock.calls[2][1];
    expect(refreshInit.method).toBe('POST');
    expect(refreshInit.headers['x-csrf-token']).toBe('r-tok');
  });

  it('does not refresh on a 401 from an /auth/ path (avoids loops)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'c' })) // mutation csrf
      .mockResolvedValueOnce(jsonResponse(401, { message: 'bad creds' })); // login 401

    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    // It first fetched csrf (mutation) then hit login and got 401. No refresh call.
    const urls = fetchMock.mock.calls.map(([u]) => u);
    expect(urls).toEqual(['/api/auth/csrf', '/api/auth/login']);
    expect(urls).not.toContain('/api/auth/refresh');
  });

  it('only retries once after refresh; a second 401 surfaces as ApiError', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' })) // GET 401
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'r' })) // csrf for refresh
      .mockResolvedValueOnce(jsonResponse(200, { refreshed: true })) // refresh ok
      .mockResolvedValueOnce(jsonResponse(401, { message: 'still expired' })); // retry 401

    await expect(api('/users/me')).rejects.toMatchObject({ status: 401 });

    // refresh must not be attempted a second time
    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u === '/api/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
  });

  it('refreshes csrf once and retries on a 403 mutation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'old' })) // initial csrf
      .mockResolvedValueOnce(jsonResponse(403, { message: 'csrf' })) // POST 403
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'new' })) // re-fetch csrf
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retry POST ok

    const data = await api<{ ok: boolean }>('/users', { method: 'POST', body: {} });
    expect(data).toEqual({ ok: true });

    // the retry must carry the refreshed token
    const retryInit = fetchMock.mock.calls[3][1];
    expect(retryInit.headers['x-csrf-token']).toBe('new');
  });

  it('throws ApiError carrying the status and parsed body on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { message: 'Validation failed', code: 'BAD' }),
    );

    const err = (await api('/users/me').catch((e) => e)) as ApiErrorType;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.body).toEqual({ message: 'Validation failed', code: 'BAD' });
    expect(err.message).toBe('Validation failed');
    expect(err.name).toBe('ApiError');
  });

  it('falls back to a generic message when the error body has none', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    const err = (await api('/users/me').catch((e) => e)) as ApiErrorType;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain('500');
  });

  it('returns null for an empty (ok) response body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204, undefined));
    const data = await api('/users/me');
    expect(data).toBeNull();
  });
});

describe('silent refresh', () => {
  it('N concurrent 401s share ONE refresh call (single-flight)', async () => {
    // Every call to the resource 401s until the refresh lands; after it, they
    // all succeed. Without single-flight each of the four would fire its own
    // POST /api/auth/refresh with the SAME cookie — which the backend reads as
    // reuse and answers by killing the session.
    let refreshed = false;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/csrf') return jsonResponse(200, { csrfToken: 'r-tok' });
      if (url === '/api/auth/refresh') {
        refreshed = true;
        return jsonResponse(200, { ok: true });
      }
      return refreshed ? jsonResponse(200, { ok: true }) : jsonResponse(401, { message: 'exp' });
    });

    const results = await Promise.all([api('/a'), api('/b'), api('/c'), api('/d')]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);

    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u === '/api/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
  });

  it('a later 401 starts a NEW refresh (the in-flight slot is released)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'exp' }))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })) // refresh #1
      .mockResolvedValueOnce(jsonResponse(200, { first: true }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'exp' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })) // refresh #2
      .mockResolvedValueOnce(jsonResponse(200, { second: true }));

    await api('/a');
    await api('/b');

    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u === '/api/auth/refresh');
    expect(refreshCalls).toHaveLength(2);
  });

  it('redirects to /login when the refresh itself is refused with 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'exp' })) // GET 401
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 't' })) // csrf
      .mockResolvedValueOnce(jsonResponse(401, { message: 'dead' })); // refresh 401

    await expect(api('/users/me')).rejects.toMatchObject({ status: 401 });
    expect(assignMock).toHaveBeenCalledWith('/login?from=%2Fdashboard');
    // The resource is NOT retried once the session is gone.
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/users/me')).toHaveLength(1);
  });

  it('does NOT redirect when the refresh fails with a network error', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'exp' }))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 't' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(api('/users/me')).rejects.toMatchObject({ status: 401 });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('does NOT redirect when the refresh fails with a 5xx', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'exp' }))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(jsonResponse(503, { message: 'down' }));

    await expect(api('/users/me')).rejects.toMatchObject({ status: 401 });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('never redirects away from /login itself', async () => {
    stubLocation('/login', '?from=%2Fdashboard');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'exp' }))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'dead' }));

    await expect(api('/users/me')).rejects.toMatchObject({ status: 401 });
    expect(assignMock).not.toHaveBeenCalled();
  });
});

describe('apiUpload()', () => {
  it('sends FormData with a csrf header and without a content-type', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'up-tok' })) // csrf
      .mockResolvedValueOnce(jsonResponse(200, { url: '/avatar.png' })); // upload

    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');

    const data = await apiUpload<{ url: string }>('/files/avatar', fd);
    expect(data).toEqual({ url: '/avatar.png' });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/files/avatar');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['x-csrf-token']).toBe('up-tok');
    // crucial: never set content-type so the browser adds the multipart boundary
    expect(init.headers['content-type']).toBeUndefined();
  });

  it('throws ApiError when the upload fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(jsonResponse(413, { message: 'Too large' }));

    const fd = new FormData();
    const err = (await apiUpload('/files/avatar', fd).catch((e) => e)) as ApiErrorType;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.body).toEqual({ message: 'Too large' });
  });
});
