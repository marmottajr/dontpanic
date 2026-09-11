import {
  sessionEndReasonSchema,
  type ApiErrorBody,
  type SessionEndedReason,
} from '@dontpanic/shared';

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
export function redirectToLogin(): void {
  const { pathname, search } = window.location;
  if (pathname === '/login') return;
  window.location.assign(`/login?from=${encodeURIComponent(`${pathname}${search}`)}`);
}

/**
 * A listener notified once, when the session is definitively over.
 *
 * Returning `true` means "I am telling the user about this myself" — the client
 * then leaves the browser where it is instead of bouncing to /login, so whatever
 * the listener rendered (the session-ended dialog) stays on screen long enough
 * to be read. Returning nothing lets the default redirect happen.
 */
export type SessionEndedListener = (reason: SessionEndedReason) => boolean | void;

const sessionEndedListeners = new Set<SessionEndedListener>();

/** Subscribe to the end of the session. Returns the unsubscribe function. */
export function onSessionEnded(listener: SessionEndedListener): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

/**
 * The latch. Once the session is definitively dead, it never comes back in this
 * document: every later refresh attempt is pointless, and firing them means a
 * dead tab quietly hammering the backend with a revoked cookie.
 */
let sessionOver = false;

/**
 * End the session exactly once: trip the latch, drop the CSRF token (it belongs
 * to a session that no longer exists), tell whoever is listening, and only then
 * fall back to the bare redirect if nobody took ownership of explaining it.
 */
function endSession(reason: SessionEndedReason): void {
  if (sessionOver) return;
  sessionOver = true;
  csrfToken = null;

  let handled = false;
  for (const listener of sessionEndedListeners) {
    // A listener that throws must never strand the user on a dead screen.
    try {
      if (listener(reason) === true) handled = true;
    } catch {
      /* ignored on purpose */
    }
  }

  if (!handled) redirectToLogin();
}

/**
 * Pull the reason out of a 401 body. An absent, malformed or unknown value
 * degrades to 'expired': the reason drives a translated message, so an
 * unrecognised string must never reach the screen.
 */
async function readSessionEndedReason(res: Response): Promise<SessionEndedReason> {
  try {
    const text = await res.text();
    const body = text ? (JSON.parse(text) as ApiErrorBody) : null;
    const parsed = sessionEndReasonSchema.safeParse(body?.sessionEnded);
    return parsed.success ? parsed.data : 'expired';
  } catch {
    return 'expired';
  }
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
  // The latch: a session that has already ended never renews. Without this a
  // dead tab keeps retrying forever, one doomed refresh per failed request.
  if (sessionOver) return Promise.resolve(false);

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
        endSession(await readSessionEndedReason(res));
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
