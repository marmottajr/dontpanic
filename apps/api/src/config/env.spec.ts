import { validateEnv } from './env';

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
});
