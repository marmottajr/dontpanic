import { NoopCaptchaAdapter } from './noop-captcha.adapter';
import { RecaptchaAdapter } from './recaptcha.adapter';
import { TurnstileAdapter } from './turnstile.adapter';
import { CaptchaUnavailableError, siteVerify } from './siteverify';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ok = (payload: unknown) => ({ ok: true, json: async () => payload });

describe('NoopCaptchaAdapter', () => {
  it('reports itself disabled and approves anything', async () => {
    const adapter = new NoopCaptchaAdapter();
    expect(adapter.enabled).toBe(false);
    await expect(adapter.verify()).resolves.toEqual({ success: true });
  });
});

describe('siteVerify', () => {
  const base = { endpoint: 'https://verify.test', secret: 's3cr3t', token: 'tok', timeoutMs: 100 };

  it('posts the secret, token and client ip as form data', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, score: 0.9 }));
    const result = await siteVerify({ ...base, ip: '203.0.113.7' });

    expect(result).toEqual({ success: true, score: 0.9, action: undefined, errors: undefined });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://verify.test');
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('secret=s3cr3t');
    expect(body).toContain('response=tok');
    expect(body).toContain('remoteip=203.0.113.7');
  });

  it('omits remoteip when the caller has no ip', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }));
    await siteVerify({ ...base, ip: null });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as URLSearchParams).toString()).not.toContain('remoteip');
  });

  it('surfaces the provider error codes', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    );
    await expect(siteVerify(base)).resolves.toMatchObject({
      success: false,
      errors: ['timeout-or-duplicate'],
    });
  });

  it('raises CaptchaUnavailableError on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });
    await expect(siteVerify(base)).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('raises CaptchaUnavailableError when the request itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(siteVerify(base)).rejects.toThrow('socket hang up');
  });

  it('raises CaptchaUnavailableError when the rejection is not an Error', async () => {
    fetchMock.mockRejectedValueOnce('nope');
    await expect(siteVerify(base)).rejects.toThrow('siteverify request failed');
  });
});

describe('TurnstileAdapter', () => {
  const adapter = new TurnstileAdapter('secret', 100);

  it('is enabled', () => {
    expect(adapter.enabled).toBe(true);
  });

  it('rejects a missing token without calling Cloudflare', async () => {
    await expect(adapter.verify(null, {})).resolves.toEqual({
      success: false,
      errors: ['missing-input-response'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a verified token', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }));
    await expect(adapter.verify('tok', { ip: '1.1.1.1' })).resolves.toEqual({
      success: true,
      errors: undefined,
    });
  });

  it('fails a rejected token', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    await expect(adapter.verify('tok', {})).resolves.toMatchObject({ success: false });
  });
});

describe('RecaptchaAdapter', () => {
  const v2 = new RecaptchaAdapter({ secret: 's', timeoutMs: 100, version: 'v2', minScore: 0.5 });
  const v3 = new RecaptchaAdapter({ secret: 's', timeoutMs: 100, version: 'v3', minScore: 0.5 });

  it('rejects a missing token without calling Google', async () => {
    await expect(v3.verify(undefined, {})).resolves.toEqual({
      success: false,
      errors: ['missing-input-response'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('v2 passes on success alone, ignoring any score', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, score: 0.1 }));
    await expect(v2.verify('tok', { action: 'login' })).resolves.toEqual({ success: true });
  });

  it('v2 fails when Google says so', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, 'error-codes': ['bad-request'] }));
    await expect(v2.verify('tok', {})).resolves.toMatchObject({
      success: false,
      errors: ['bad-request'],
    });
  });

  it('v3 passes a token that clears the threshold', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, score: 0.7, action: 'login' }));
    await expect(v3.verify('tok', { action: 'login' })).resolves.toEqual({
      success: true,
      score: 0.7,
    });
  });

  it('v3 rejects a token minted for a different action', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, score: 0.9, action: 'contact' }));
    await expect(v3.verify('tok', { action: 'login' })).resolves.toMatchObject({
      success: false,
      errors: ['action-mismatch'],
    });
  });

  it('v3 rejects a score below the threshold', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, score: 0.2, action: 'login' }));
    await expect(v3.verify('tok', { action: 'login' })).resolves.toMatchObject({
      success: false,
      errors: ['low-score'],
    });
  });

  it('v3 treats a missing score as zero', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, action: 'login' }));
    await expect(v3.verify('tok', { action: 'login' })).resolves.toMatchObject({
      success: false,
      errors: ['low-score'],
    });
  });

  it('v3 skips the action check when the provider does not echo one', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, score: 0.8 }));
    await expect(v3.verify('tok', { action: 'login' })).resolves.toMatchObject({ success: true });
  });
});
