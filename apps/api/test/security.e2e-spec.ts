import { ConfigService } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CAPTCHA_PROVIDER } from '../src/core/captcha/captcha.provider';
import { TurnstileAdapter } from '../src/infra/captcha/turnstile.adapter';
import { createE2EApp } from './e2e-app';
import { E2EClient } from './e2e-client';

/**
 * The two pre-auth defences, end to end: the tight budget on the
 * @SensitiveThrottle() routes and the @RequireCaptcha() guard.
 *
 * The main e2e suite deliberately turns both off (huge limits, driver `none`)
 * so the auth flows can loop freely, so each describe here boots its OWN app —
 * separate in-memory throttler store, no counters leaking across tests.
 */
describe('Pre-auth defences (e2e)', () => {
  const LOGIN = { email: 'nobody@dontpanic.dev', password: 'WrongPassword1!' };

  async function newClient(app: NestFastifyApplication): Promise<E2EClient> {
    const client = new E2EClient(app);
    await client.bootstrapCsrf();
    return client;
  }

  describe('rate limit on sensitive routes', () => {
    const MAX = 3;
    let app: NestFastifyApplication;

    beforeAll(async () => {
      // The throttler resolves its limit per request, so intercepting the
      // config read is enough — no need to rebuild the module.
      const realGet = ConfigService.prototype.get;
      jest.spyOn(ConfigService.prototype, 'get').mockImplementation(function (
        this: ConfigService,
        key: string,
        ...rest: unknown[]
      ) {
        if (key === 'AUTH_RATE_LIMIT_MAX') return MAX;
        return (realGet as (...args: unknown[]) => unknown).call(this, key, ...rest);
      } as typeof ConfigService.prototype.get);
      app = await createE2EApp();
    });

    afterAll(async () => {
      await app.close();
      jest.restoreAllMocks();
    });

    it('lets the budget through, then answers 429', async () => {
      const client = await newClient(app);

      for (let i = 0; i < MAX; i += 1) {
        const res = await client.post('/api/auth/login', LOGIN);
        expect(res.status).toBe(401); // wrong credentials, but allowed through
      }

      const blocked = await client.post('/api/auth/login', LOGIN);
      expect(blocked.status).toBe(429);
    });

    it('counts per route, so an exhausted login does not lock out other endpoints', async () => {
      const client = await newClient(app);
      // /auth/login is already spent by the test above — same IP, same key.
      expect((await client.post('/api/auth/login', LOGIN)).status).toBe(429);
      expect((await client.get('/api/auth/csrf')).status).toBe(200);
    });

    it('advertises the remaining budget in the rate-limit headers', async () => {
      const client = await newClient(app);
      const res = await client.get('/api/auth/csrf');
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });

  describe('captcha guard', () => {
    let app: NestFastifyApplication;
    let fetchMock: jest.Mock;

    beforeAll(async () => {
      app = await createE2EApp((builder) =>
        builder
          .overrideProvider(CAPTCHA_PROVIDER)
          .useValue(new TurnstileAdapter('e2e-captcha-secret', 2000)),
      );
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('refuses a login with no captcha token, without touching the password', async () => {
      const client = await newClient(app);
      const res = await client.post('/api/auth/login', LOGIN);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('CaptchaRequired');
      // A missing token is settled locally — no round trip to Cloudflare.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('answers a provider-rejected token with the same opaque error', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      });
      const client = await newClient(app);
      const res = await client.post('/api/auth/login', { ...LOGIN, captchaToken: 'forged' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('CaptchaRequired');
    });

    it('lets a verified token through to the real credential check', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
      const client = await newClient(app);
      const res = await client.post('/api/auth/login', { ...LOGIN, captchaToken: 'solved' });

      // Past the guard: now it fails for the ordinary reason.
      expect(res.status).toBe(401);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.body as URLSearchParams).toString()).toContain('response=solved');
    });

    it('returns 503 rather than silently passing when the provider is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const client = await newClient(app);
      const res = await client.post('/api/auth/login', { ...LOGIN, captchaToken: 'solved' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('CaptchaUnavailable');
    });
  });
});
