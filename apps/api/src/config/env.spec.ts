import { parseOAuthProviders, parseTrustProxy, validateEnv } from './env';

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
    expect(env.API_HOST).toBe('0.0.0.0');
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.JWT_REFRESH_TTL).toBe(604800);
    expect(env.STORAGE_DRIVER).toBe('s3');
    expect(env.MAIL_DRIVER).toBe('smtp');
    expect(env.CACHE_DRIVER).toBe('redis');
    expect(env.TOTP_ISSUER).toBe('DontPanic');
    expect(env.LOGIN_MAX_ATTEMPTS).toBe(5);
  });

  // Every default that names a port has to be the project's own 42xx value.
  // When they were the framework defaults (3001/3000/6379/9000/1025) a .env
  // that simply omitted a key still passed validation and then failed much
  // later, as a connection error to a port where nothing of ours listens —
  // the kind of failure nobody traces back to a missing line in a file.
  it('defaults every address to the 42xx range .env.example documents', () => {
    const env = validateEnv(baseConfig());
    expect(env.API_PORT).toBe(4201);
    expect(env.REDIS_URL).toBe('redis://localhost:4203');
    expect(env.WEB_ORIGIN).toBe('http://localhost:4200');
    expect(env.API_PUBLIC_URL).toBe('http://localhost:4201');
    expect(env.MAIL_PORT).toBe(4206);
    expect(env.S3_ENDPOINT).toBe('http://localhost:4204');
    expect(env.S3_PUBLIC_URL).toBe('http://localhost:4204/dontpanic');
    expect(env.LOCAL_STORAGE_PUBLIC_URL).toBe('http://localhost:4201/files');
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

  describe('public signup', () => {
    it('defaults to on, preserving the behaviour a clone has always had', () => {
      expect(validateEnv(baseConfig()).PUBLIC_SIGNUP_ENABLED).toBe(true);
    });

    it("honours an explicit 'false'", () => {
      expect(
        validateEnv(baseConfig({ PUBLIC_SIGNUP_ENABLED: 'false' })).PUBLIC_SIGNUP_ENABLED,
      ).toBe(false);
    });
  });

  describe('invitations', () => {
    it('defaults to a week, long enough to survive a holiday', () => {
      expect(validateEnv(baseConfig()).INVITATION_TTL_HOURS).toBe(168);
      expect(validateEnv(baseConfig()).INVITATION_MAX_RESENDS).toBe(5);
    });

    it('refuses a TTL beyond a month of hours', () => {
      expect(() => validateEnv(baseConfig({ INVITATION_TTL_HOURS: 5000 }))).toThrow(
        /INVITATION_TTL_HOURS/,
      );
    });
  });

  describe('oauth', () => {
    const google = {
      OAUTH_PROVIDERS: 'google',
      OAUTH_CALLBACK_BASE_URL: 'http://localhost:4200/api',
      OAUTH_GOOGLE_CLIENT_ID: 'id',
      OAUTH_GOOGLE_CLIENT_SECRET: 'secret',
    };

    it('is off by default, so a fresh clone boots with no third-party keys', () => {
      const env = validateEnv(baseConfig());
      expect(env.OAUTH_PROVIDERS).toBe('');
      expect(parseOAuthProviders(env.OAUTH_PROVIDERS)).toEqual([]);
    });

    it('accepts a fully configured provider', () => {
      expect(() => validateEnv(baseConfig(google))).not.toThrow();
    });

    // The failure this prevents: a button renders on the login page for a
    // provider the API cannot talk to, and the user meets a 404 instead of a
    // sign-in. Better to never start.
    it('refuses a listed provider with a missing credential', () => {
      const cfg = baseConfig({ ...google, OAUTH_GOOGLE_CLIENT_SECRET: '' });
      expect(() => validateEnv(cfg)).toThrow(/OAUTH_GOOGLE_CLIENT_SECRET/);
      expect(() => validateEnv(cfg)).toThrow(/google/);
    });

    it("names every one of Apple's four required keys", () => {
      const cfg = baseConfig({
        OAUTH_PROVIDERS: 'apple',
        OAUTH_CALLBACK_BASE_URL: 'http://localhost:4200/api',
      });
      expect(() => validateEnv(cfg)).toThrow(/OAUTH_APPLE_CLIENT_ID/);
      expect(() => validateEnv(cfg)).toThrow(/OAUTH_APPLE_TEAM_ID/);
      expect(() => validateEnv(cfg)).toThrow(/OAUTH_APPLE_KEY_ID/);
      expect(() => validateEnv(cfg)).toThrow(/OAUTH_APPLE_PRIVATE_KEY/);
    });

    it('requires a callback base URL once any provider is on', () => {
      const cfg = baseConfig({ ...google, OAUTH_CALLBACK_BASE_URL: '' });
      expect(() => validateEnv(cfg)).toThrow(/OAUTH_CALLBACK_BASE_URL/);
    });

    // A typo here would otherwise disable, in silence, the button the operator
    // believed they had switched on.
    it('rejects a name that is not a provider', () => {
      const cfg = baseConfig({ ...google, OAUTH_PROVIDERS: 'google,gogle' });
      expect(() => validateEnv(cfg)).toThrow(/unknown provider "gogle"/);
    });

    describe('parseOAuthProviders', () => {
      it('trims, lowercases and de-duplicates', () => {
        expect(parseOAuthProviders(' Google , github ,google ')).toEqual(['google', 'github']);
      });

      it('treats an empty or undefined list as nothing enabled', () => {
        expect(parseOAuthProviders('')).toEqual([]);
        expect(parseOAuthProviders(undefined)).toEqual([]);
      });

      it('drops unknown names (validateEnv is what refuses them loudly)', () => {
        expect(parseOAuthProviders('google,nope')).toEqual(['google']);
      });
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
