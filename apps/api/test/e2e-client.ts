import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

type Headers = Record<string, string>;

/**
 * Per-request options. `cookies` REPLACE a named cookie just for this request;
 * `headers` add headers a browser sends on its own and supertest does not
 * (`user-agent`, `accept-language`) — without them there is no way to prove,
 * end to end, that the server records them.
 */
type RequestOptions = { cookies?: Record<string, string>; headers?: Headers };

/**
 * A tiny cookie-jar + CSRF aware HTTP client over supertest.
 *
 * Browsers do two things this wrapper emulates: (a) persist Set-Cookie across
 * requests, and (b) echo the CSRF token. `bootstrapCsrf()` hits GET
 * /api/auth/csrf, stores the `csrf_token` cookie it sets, and remembers the
 * returned token so every unsafe request carries a matching `x-csrf-token`
 * header + cookie — the double-submit pair the server enforces.
 */
export class E2EClient {
  private cookies = new Map<string, string>();
  private csrfToken = '';

  constructor(private readonly app: NestFastifyApplication) {}

  private server(): ReturnType<NestFastifyApplication['getHttpServer']> {
    return this.app.getHttpServer();
  }

  /** Persist Set-Cookie values from a response into the jar (handles clears). */
  private storeCookies(res: supertest.Response): void {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    if (!raw) return;
    for (const line of raw) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // An expired/empty cookie (logout clears) drops it from the jar.
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(line)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  /**
   * Fetch a CSRF token and store its cookie so unsafe calls can succeed.
   *
   * Fails here, and loudly, if the route returns no token. Without this guard
   * an undefined `csrfToken` only showed up much later — and in a different
   * test — as `Invalid value "undefined" for header "x-csrf-token"`, which says
   * nothing about what went wrong, or where.
   */
  async bootstrapCsrf(): Promise<void> {
    const res = await this.get('/api/auth/csrf');
    const token = res.body?.csrfToken as string | undefined;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error(
        `GET /api/auth/csrf returned no token (status ${res.status}): ${JSON.stringify(res.body)}`,
      );
    }
    this.csrfToken = token;
  }

  /**
   * Build the Cookie header from the jar, with optional one-off overrides that
   * REPLACE a named cookie just for this request (merged with — not clobbering —
   * the rest of the jar, so e.g. the csrf_token cookie always rides along), then
   * apply any per-request headers.
   */
  private applyCommon(req: supertest.Test, opts: RequestOptions): supertest.Test {
    const merged = new Map(this.cookies);
    if (opts.cookies) for (const [k, v] of Object.entries(opts.cookies)) merged.set(k, v);
    const cookie = [...merged.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) req.set('Cookie', cookie);
    for (const [name, value] of Object.entries(opts.headers ?? {})) req.set(name, value);
    return req;
  }

  /** Same wiring for every unsafe verb: jar + overrides + the CSRF header. */
  private unsafe(req: supertest.Test, opts: RequestOptions): supertest.Test {
    return this.applyCommon(req, opts).set('x-csrf-token', this.csrfToken);
  }

  async get(path: string, opts: RequestOptions = {}): Promise<supertest.Response> {
    const req = this.applyCommon(supertest(this.server()).get(path), opts);
    const res = await req;
    this.storeCookies(res);
    return res;
  }

  async post(path: string, body?: unknown, opts: RequestOptions = {}): Promise<supertest.Response> {
    const req = this.unsafe(supertest(this.server()).post(path), opts);
    const res = body === undefined ? await req : await req.send(body as object);
    this.storeCookies(res);
    return res;
  }

  async patch(
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<supertest.Response> {
    const req = this.unsafe(supertest(this.server()).patch(path), opts);
    const res = body === undefined ? await req : await req.send(body as object);
    this.storeCookies(res);
    return res;
  }

  async put(path: string, body?: unknown, opts: RequestOptions = {}): Promise<supertest.Response> {
    const req = this.unsafe(supertest(this.server()).put(path), opts);
    const res = body === undefined ? await req : await req.send(body as object);
    this.storeCookies(res);
    return res;
  }

  async delete(path: string, opts: RequestOptions = {}): Promise<supertest.Response> {
    const req = this.unsafe(supertest(this.server()).delete(path), opts);
    const res = await req;
    this.storeCookies(res);
    return res;
  }

  /** Inspect / mutate the jar for assertions (e.g. assert cookies cleared). */
  hasCookie(name: string): boolean {
    return this.cookies.has(name) && this.cookies.get(name) !== '';
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /** Drop the auth cookies locally (simulate a fresh, logged-out browser). */
  clearAuthCookies(): void {
    this.cookies.delete('access_token');
    this.cookies.delete('refresh_token');
  }
}
