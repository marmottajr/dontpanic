import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The module reads NEXT_PUBLIC_* once, at import time (Next inlines them at
 * build time), so every case stubs the env and then re-imports.
 */
async function loadModule(driver: string, siteKey = 'site-key') {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_CAPTCHA_DRIVER', driver);
  vi.stubEnv('NEXT_PUBLIC_CAPTCHA_SITE_KEY', siteKey);
  return import('./captcha');
}

/** Resolve/reject the <script> the loader just appended. */
function settleScript(event: 'load' | 'error') {
  const el = document.head.querySelector('script');
  if (!el) throw new Error('no script was appended');
  el.dispatchEvent(new Event(event));
  return el;
}

describe('captcha config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    document.head.innerHTML = '';
    delete window.turnstile;
    delete window.grecaptcha;
  });

  it('is disabled by default', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_CAPTCHA_DRIVER', undefined);
    vi.stubEnv('NEXT_PUBLIC_CAPTCHA_SITE_KEY', undefined);
    const mod = await import('./captcha');
    expect(mod.captchaDriver).toBe('none');
    expect(mod.captchaSiteKey).toBe('');
    expect(mod.captchaEnabled).toBe(false);
  });

  it('stays disabled when a driver is set without a site key', async () => {
    const mod = await loadModule('turnstile', '');
    expect(mod.captchaEnabled).toBe(false);
  });

  it('is enabled once driver and site key agree', async () => {
    const mod = await loadModule('turnstile');
    expect(mod.captchaEnabled).toBe(true);
  });
});

describe('loadCaptchaScript', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    document.head.innerHTML = '';
  });

  it('appends nothing while the driver is none', async () => {
    const mod = await loadModule('none');
    await expect(mod.loadCaptchaScript()).resolves.toBeUndefined();
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('loads the Turnstile explicit-render script', async () => {
    const mod = await loadModule('turnstile');
    const promise = mod.loadCaptchaScript();
    const el = settleScript('load');
    await expect(promise).resolves.toBeUndefined();
    expect(el.getAttribute('src')).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    );
  });

  it('loads the reCAPTCHA v2 explicit-render script', async () => {
    const mod = await loadModule('recaptcha-v2');
    const promise = mod.loadCaptchaScript();
    const el = settleScript('load');
    await promise;
    expect(el.getAttribute('src')).toBe('https://www.google.com/recaptcha/api.js?render=explicit');
  });

  it('binds the site key into the reCAPTCHA v3 script url', async () => {
    const mod = await loadModule('recaptcha-v3', 'key/with+chars');
    const promise = mod.loadCaptchaScript();
    const el = settleScript('load');
    await promise;
    expect(el.getAttribute('src')).toBe(
      'https://www.google.com/recaptcha/api.js?render=key%2Fwith%2Bchars',
    );
  });

  it('injects the script only once no matter how many forms ask', async () => {
    const mod = await loadModule('turnstile');
    const first = mod.loadCaptchaScript();
    const second = mod.loadCaptchaScript();
    settleScript('load');
    await Promise.all([first, second]);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('rejects on a load failure and lets the next attempt retry', async () => {
    const mod = await loadModule('turnstile');
    const failing = mod.loadCaptchaScript();
    settleScript('error');
    await expect(failing).rejects.toThrow('captcha script failed to load');

    document.head.innerHTML = '';
    const retry = mod.loadCaptchaScript();
    settleScript('load');
    await expect(retry).resolves.toBeUndefined();
  });
});

describe('whenApiReady', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete window.turnstile;
    delete window.grecaptcha;
  });

  it('resolves as soon as window.turnstile shows up', async () => {
    const mod = await loadModule('turnstile');
    const ready = mod.whenApiReady();
    // The script's load event fires before the global is assigned, so the
    // first poll misses and the retry is what resolves.
    await vi.advanceTimersByTimeAsync(50);
    window.turnstile = {} as never;
    await vi.advanceTimersByTimeAsync(50);
    await expect(ready).resolves.toBeUndefined();
  });

  it('resolves immediately when turnstile is already there', async () => {
    const mod = await loadModule('turnstile');
    window.turnstile = {} as never;
    await expect(mod.whenApiReady()).resolves.toBeUndefined();
  });

  it('defers to grecaptcha.ready for the Google drivers', async () => {
    const mod = await loadModule('recaptcha-v3');
    const ready = vi.fn((cb: () => void) => cb());
    const promise = mod.whenApiReady();
    await vi.advanceTimersByTimeAsync(50);
    window.grecaptcha = { ready } as never;
    await vi.advanceTimersByTimeAsync(50);
    await expect(promise).resolves.toBeUndefined();
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
