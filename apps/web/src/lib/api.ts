import type { ApiErrorBody } from '@dontpanic/shared';

/**
 * Browser-side API client. Talks ONLY to the same-origin BFF proxy
 * (/api/* -> Next route handler -> backend), so httpOnly cookies never leave
 * the web origin. Adds CSRF on mutations and transparently refreshes once on 401.
 */
let csrfToken: string | null = null;

async function fetchCsrf(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  const data = (await res.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function getCsrf(): Promise<string> {
  return csrfToken ?? (await fetchCsrf());
}

/**
 * Send the browser to /login, remembering where it was (same `from` key the
 * Next proxy uses). Browser-only, like the rest of this module.
 */
function redirectToLogin(): void {
  const { pathname, search } = window.location;
  if (pathname === '/login') return;
  window.location.assign(`/login?from=${encodeURIComponent(`${pathname}${search}`)}`);
}

/**
 * The refresh currently in flight, shared by every caller.
 *
 * Without this, N queries taking a 401 at the same moment fired N refreshes with
 * the SAME refresh cookie: the backend rotates the token on the first and reads
 * the rest as reuse, revoking the whole family — the session dying because two
 * queries ran in parallel.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': await getCsrf() },
      });
      // A 401 is the only verdict that ends the session. A network failure
      // (fetch rejecting) or a 5xx are transient: nobody gets thrown out for
      // losing the wi-fi for a second.
      if (res.status === 401) {
        csrfToken = null;
        redirectToLogin();
      }
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody | null,
  ) {
    super(body?.message ? String(body.message) : `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** internal: prevents infinite refresh/csrf retry loops */
  _retried?: boolean;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const isMutation = method !== 'GET';
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (isMutation) headers['x-csrf-token'] = await getCsrf();

  const res = await fetch(`/api${path}`, { method, headers, body, credentials: 'include' });

  // CSRF token rotated/expired -> refresh it once and retry.
  if (res.status === 403 && isMutation && !options._retried) {
    await fetchCsrf();
    return api<T>(path, { ...options, _retried: true });
  }

  // Access token expired -> join the one silent refresh, then retry.
  if (res.status === 401 && !options._retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, { ...options, _retried: true });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody);
  return data as T;
}

/** Multipart upload (e.g. avatar). Sends CSRF; never sets content-type so the
 *  browser adds the multipart boundary itself. */
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'x-csrf-token': await getCsrf() },
    body: formData,
    credentials: 'include',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody);
  return data as T;
}
