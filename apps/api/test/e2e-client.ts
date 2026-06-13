import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

type Headers = Record<string, string>;

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

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
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

  /** Fetch a CSRF token and store its cookie so unsafe calls can succeed. */
  async bootstrapCsrf(): Promise<void> {
    const res = await this.get('/api/auth/csrf');
    this.csrfToken = res.body.csrfToken;
  }

  /**
   * Build the Cookie header from the jar, with optional one-off overrides that
   * REPLACE a named cookie just for this request (merged with — not clobbering —
   * the rest of the jar, so e.g. the csrf_token cookie always rides along).
   */
  private applyCommon(req: supertest.Test, overrides?: Record<string, string>): supertest.Test {
    const merged = new Map(this.cookies);
    if (overrides) for (const [k, v] of Object.entries(overrides)) merged.set(k, v);
    const cookie = [...merged.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) req.set('Cookie', cookie);
    return req;
  }

  async get(
    path: string,
    opts: { cookies?: Record<string, string> } = {},
  ): Promise<supertest.Response> {
    const req = this.applyCommon(supertest(this.server()).get(path), opts.cookies);
    const res = await req;
    this.storeCookies(res);
    return res;
  }

  async post(
    path: string,
    body?: unknown,
    opts: { cookies?: Record<string, string> } = {},
  ): Promise<supertest.Response> {
    const req = this.applyCommon(supertest(this.server()).post(path), opts.cookies).set(
      'x-csrf-token',
      this.csrfToken,
    );
    const res = body === undefined ? await req : await req.send(body as object);
    this.storeCookies(res);
    return res;
  }

  async patch(
    path: string,
    body?: unknown,
    opts: { cookies?: Record<string, string> } = {},
  ): Promise<supertest.Response> {
    const req = this.applyCommon(supertest(this.server()).patch(path), opts.cookies).set(
      'x-csrf-token',
      this.csrfToken,
    );
    const res = body === undefined ? await req : await req.send(body as object);
    this.storeCookies(res);
    return res;
  }

  async delete(
    path: string,
    opts: { cookies?: Record<string, string> } = {},
  ): Promise<supertest.Response> {
    const req = this.applyCommon(supertest(this.server()).delete(path), opts.cookies).set(
      'x-csrf-token',
      this.csrfToken,
    );
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
