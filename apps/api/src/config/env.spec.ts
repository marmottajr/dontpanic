import { parseTrustProxy, validateEnv } from './env';

/** A minimal config that satisfies all required fields. */
function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'access-secret-0123456789',
    JWT_REFRESH_SECRET: 'refresh-secret-0123456789',
    CSRF_SECRET: 'csrf-secret-0123456789',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('parses a valid env and applies defaults', () => {
    const env = validateEnv(baseConfig());
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.API_HOST).toBe('0.0.0.0');
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.JWT_REFRESH_TTL).toBe(604800);
    expect(env.STORAGE_DRIVER).toBe('s3');
    expect(env.MAIL_DRIVER).toBe('smtp');
    expect(env.CACHE_DRIVER).toBe('redis');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.TOTP_ISSUER).toBe('DontPanic');
    expect(env.LOGIN_MAX_ATTEMPTS).toBe(5);
  });

  it('throws a helpful error when a required secret is missing', () => {
    const cfg = baseConfig();
    delete cfg.DATABASE_URL;
    expect(() => validateEnv(cfg)).toThrow(/Invalid environment variables/);
    expect(() => validateEnv(cfg)).toThrow(/DATABASE_URL/);
  });

  it('rejects a JWT secret shorter than 16 chars', () => {
    expect(() => validateEnv(baseConfig({ JWT_ACCESS_SECRET: 'short' }))).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects a non-numeric API_PORT (bad type via coercion)', () => {
    expect(() => validateEnv(baseConfig({ API_PORT: 'not-a-number' }))).toThrow(/API_PORT/);
  });

  it('coerces numeric strings for numeric fields', () => {
    const env = validateEnv(baseConfig({ API_PORT: '8080', JWT_ACCESS_TTL: '300' }));
    expect(env.API_PORT).toBe(8080);
    expect(env.JWT_ACCESS_TTL).toBe(300);
  });

  it('rejects an invalid enum value', () => {
    expect(() => validateEnv(baseConfig({ CACHE_DRIVER: 'mongodb' }))).toThrow(/CACHE_DRIVER/);
    expect(() => validateEnv(baseConfig({ NODE_ENV: 'staging' }))).toThrow(/NODE_ENV/);
  });

  describe('boolish coercion of COOKIE_SECURE', () => {
    it("coerces the string 'false' to boolean false (not truthy)", () => {
      expect(validateEnv(baseConfig({ COOKIE_SECURE: 'false' })).COOKIE_SECURE).toBe(false);
    });

    it("coerces 'true' and '1' to true", () => {
      expect(validateEnv(baseConfig({ COOKIE_SECURE: 'true' })).COOKIE_SECURE).toBe(true);
      expect(validateEnv(baseConfig({ COOKIE_SECURE: '1' })).COOKIE_SECURE).toBe(true);
    });

    it('passes a real boolean through unchanged', () => {
      expect(validateEnv(baseConfig({ COOKIE_SECURE: true })).COOKIE_SECURE).toBe(true);
      expect(validateEnv(baseConfig({ COOKIE_SECURE: false })).COOKIE_SECURE).toBe(false);
    });

    it('defaults to false when omitted', () => {
      expect(validateEnv(baseConfig()).COOKIE_SECURE).toBe(false);
    });

    it("coerces an arbitrary string (not 'true'/'1') to false", () => {
      expect(validateEnv(baseConfig({ COOKIE_SECURE: 'yes' })).COOKIE_SECURE).toBe(false);
    });
  });

  describe('captcha', () => {
    it('defaults to the off driver, so a fresh clone boots with no keys', () => {
      expect(validateEnv(baseConfig()).CAPTCHA_DRIVER).toBe('none');
    });

    it('refuses a driver without a secret instead of silently letting bots in', () => {
      expect(() => validateEnv(baseConfig({ CAPTCHA_DRIVER: 'turnstile' }))).toThrow(
        /CAPTCHA_SECRET_KEY/,
      );
    });

    it('accepts a driver with a secret', () => {
      const env = validateEnv(
        baseConfig({ CAPTCHA_DRIVER: 'recaptcha-v3', CAPTCHA_SECRET_KEY: 's3cr3t' }),
      );
      expect(env.CAPTCHA_DRIVER).toBe('recaptcha-v3');
      expect(env.CAPTCHA_MIN_SCORE).toBe(0.5);
    });

    it('rejects an unknown driver', () => {
      expect(() => validateEnv(baseConfig({ CAPTCHA_DRIVER: 'hcaptcha' }))).toThrow(
        /CAPTCHA_DRIVER/,
      );
    });

    it('rejects a score outside 0..1', () => {
      expect(() => validateEnv(baseConfig({ CAPTCHA_MIN_SCORE: '1.5' }))).toThrow(
        /CAPTCHA_MIN_SCORE/,
      );
    });
  });

  describe('parseTrustProxy', () => {
    it('defaults to loopback — the BFF on the same host, nobody else', () => {
      expect(parseTrustProxy(undefined)).toBe('loopback');
      expect(validateEnv(baseConfig()).TRUST_PROXY).toBe('loopback');
    });

    it('reads an explicit boolean', () => {
      expect(parseTrustProxy('true')).toBe(true);
      expect(parseTrustProxy('false')).toBe(false);
    });

    it('treats an empty value as "trust nothing" rather than "trust everything"', () => {
      expect(parseTrustProxy('')).toBe(false);
      expect(parseTrustProxy('   ')).toBe(false);
    });

    it('turns a hop count into a predicate over the hops nearest the socket', () => {
      const trust = parseTrustProxy('2');
      expect(typeof trust).toBe('function');
      const fn = trust as (address: string, hop: number) => boolean;
      expect(fn('10.0.0.1', 0)).toBe(true);
      expect(fn('10.0.0.1', 1)).toBe(true);
      expect(fn('10.0.0.1', 2)).toBe(false);
    });

    it('passes a CIDR list through for fastify to match', () => {
      expect(parseTrustProxy('10.0.0.0/8,::1')).toBe('10.0.0.0/8,::1');
      expect(parseTrustProxy(' uniquelocal ')).toBe('uniquelocal');
    });
  });
});
