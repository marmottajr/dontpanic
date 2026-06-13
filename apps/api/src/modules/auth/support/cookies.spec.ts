import { ACCESS_COOKIE, CookieService, REFRESH_COOKIE } from './cookies';

type ConfigMap = Record<string, unknown>;

function makeConfig(values: ConfigMap) {
  return {
    get: (key: string) => values[key],
  } as never;
}

function makeReply() {
  return {
    setCookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

const defaults: ConfigMap = {
  COOKIE_SECURE: false,
  NODE_ENV: 'test',
  COOKIE_DOMAIN: 'localhost',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 604800,
};

describe('CookieService', () => {
  it('sets the access cookie httpOnly, sameSite=lax, scoped to "/"', () => {
    const reply = makeReply();
    new CookieService(makeConfig(defaults)).setAccessCookie(reply as never, 'jwt-token');

    expect(reply.setCookie).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      'jwt-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        domain: 'localhost',
        maxAge: 900,
        secure: false,
      }),
    );
  });

  it('scopes the refresh cookie to /api/auth with the refresh TTL', () => {
    const reply = makeReply();
    new CookieService(makeConfig(defaults)).setRefreshCookie(reply as never, 'refresh');

    expect(reply.setCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh',
      expect.objectContaining({ path: '/api/auth', maxAge: 604800 }),
    );
  });

  it('forces Secure cookies in production even when COOKIE_SECURE is false', () => {
    const reply = makeReply();
    new CookieService(
      makeConfig({ ...defaults, COOKIE_SECURE: false, NODE_ENV: 'production' }),
    ).setAccessCookie(reply as never, 't');

    expect(reply.setCookie.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it('honours COOKIE_SECURE=true outside production', () => {
    const reply = makeReply();
    new CookieService(
      makeConfig({ ...defaults, COOKIE_SECURE: true, NODE_ENV: 'development' }),
    ).setAccessCookie(reply as never, 't');

    expect(reply.setCookie.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it('clears both auth cookies on their respective paths', () => {
    const reply = makeReply();
    new CookieService(makeConfig(defaults)).clearAuthCookies(reply as never);

    expect(reply.clearCookie).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      expect.objectContaining({ path: '/', domain: 'localhost' }),
    );
    expect(reply.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      expect.objectContaining({ path: '/api/auth', domain: 'localhost' }),
    );
  });
});
