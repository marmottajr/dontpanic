import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { CaptchaProvider } from '../../core/captcha/captcha.provider';
import { CaptchaUnavailableError } from '../../infra/captcha/siteverify';
import { CaptchaGuard } from './captcha.guard';

function makeContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

describe('CaptchaGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let config: { get: jest.Mock };
  let captcha: { enabled: boolean; verify: jest.Mock };
  let guard: CaptchaGuard;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    reflector = { getAllAndOverride: jest.fn().mockReturnValue('login') };
    config = { get: jest.fn().mockReturnValue(false) }; // CAPTCHA_FAIL_OPEN
    captcha = { enabled: true, verify: jest.fn().mockResolvedValue({ success: true }) };
    guard = new CaptchaGuard(
      reflector as unknown as Reflector,
      config as never,
      captcha as unknown as CaptchaProvider,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('is a no-op (no provider call) while the driver is off', async () => {
    captcha.enabled = false;
    await expect(guard.canActivate(makeContext({ body: {} }))).resolves.toBe(true);
    expect(captcha.verify).not.toHaveBeenCalled();
  });

  it('ignores routes that are not tagged @RequireCaptcha', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext({ body: {} }))).resolves.toBe(true);
    expect(captcha.verify).not.toHaveBeenCalled();
  });

  it('verifies the body token together with the client ip and action', async () => {
    const ctx = makeContext({ body: { captchaToken: 'tok' }, ip: '203.0.113.9', headers: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(captcha.verify).toHaveBeenCalledWith('tok', { ip: '203.0.113.9', action: 'login' });
  });

  it('falls back to the x-captcha-token header', async () => {
    const ctx = makeContext({ body: {}, headers: { 'x-captcha-token': 'from-header' } });
    await guard.canActivate(ctx);
    expect(captcha.verify).toHaveBeenCalledWith('from-header', expect.anything());
  });

  it('prefers the body token over the header', async () => {
    const ctx = makeContext({
      body: { captchaToken: 'from-body' },
      headers: { 'x-captcha-token': 'from-header' },
    });
    await guard.canActivate(ctx);
    expect(captcha.verify).toHaveBeenCalledWith('from-body', expect.anything());
  });

  it('passes null when neither carries a token', async () => {
    captcha.verify.mockResolvedValue({ success: false });
    const ctx = makeContext({ body: undefined, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(BadRequestException);
    expect(captcha.verify).toHaveBeenCalledWith(null, expect.anything());
  });

  it('ignores a non-string body token and an empty header', async () => {
    captcha.verify.mockResolvedValue({ success: false });
    const ctx = makeContext({ body: { captchaToken: 42 }, headers: { 'x-captcha-token': '' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(BadRequestException);
    expect(captcha.verify).toHaveBeenCalledWith(null, expect.anything());
  });

  it('answers every rejection with the same opaque CaptchaRequired error', async () => {
    captcha.verify.mockResolvedValue({ success: false, score: 0.1, errors: ['low-score'] });
    const ctx = makeContext({ body: { captchaToken: 'tok' }, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { statusCode: 400, error: 'CaptchaRequired' },
    });
  });

  it('rejects with 503 when the provider is unreachable and fail-open is off', async () => {
    captcha.verify.mockRejectedValue(new CaptchaUnavailableError('timeout'));
    const ctx = makeContext({ body: { captchaToken: 'tok' }, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('lets the request through when the provider is unreachable and fail-open is on', async () => {
    config.get.mockReturnValue(true);
    captcha.verify.mockRejectedValue(new CaptchaUnavailableError('timeout'));
    const ctx = makeContext({ body: { captchaToken: 'tok' }, headers: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rethrows an unexpected adapter failure instead of masking it', async () => {
    captcha.verify.mockRejectedValue(new TypeError('bug in the adapter'));
    const ctx = makeContext({ body: { captchaToken: 'tok' }, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(TypeError);
  });
});
