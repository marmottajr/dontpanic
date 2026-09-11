export type CaptchaDriver = 'none' | 'turnstile' | 'recaptcha-v2' | 'recaptcha-v3';

// Inlined at build time by Next — keep the full `process.env.NEXT_PUBLIC_*`
// member access literal, or the replacement does not happen.
export const captchaDriver = (process.env.NEXT_PUBLIC_CAPTCHA_DRIVER ?? 'none') as CaptchaDriver;
export const captchaSiteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY ?? '';

/**
 * Whether the UI should render a challenge. Must mirror the API's
 * CAPTCHA_DRIVER — if the two disagree the API rejects every submit for a token
 * the form never renders a way to obtain.
 */
export const captchaEnabled = captchaDriver !== 'none' && captchaSiteKey.length > 0;

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}

interface GrecaptchaApi {
  ready(cb: () => void): void;
  render(el: HTMLElement, opts: Record<string, unknown>): number;
  reset(id?: number): void;
  execute(siteKey: string, opts: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    grecaptcha?: GrecaptchaApi;
  }
}

function scriptUrl(): string {
  switch (captchaDriver) {
    case 'turnstile':
      return 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    case 'recaptcha-v2':
      return 'https://www.google.com/recaptcha/api.js?render=explicit';
    case 'recaptcha-v3':
      // v3 has no widget: the script is bound to the site key up front and
      // grades the session in the background.
      return `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(captchaSiteKey)}`;
    default:
      return '';
  }
}

const pending = new Map<string, Promise<void>>();

/** Injects the provider script once per page, no matter how many forms ask. */
export function loadCaptchaScript(): Promise<void> {
  const src = scriptUrl();
  if (!src) return Promise.resolve();

  let promise = pending.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.defer = true;
      el.addEventListener('load', () => resolve());
      el.addEventListener('error', () => {
        // Let the next attempt retry instead of caching the failure forever.
        pending.delete(src);
        reject(new Error('captcha script failed to load'));
      });
      document.head.appendChild(el);
    });
    pending.set(src, promise);
  }
  return promise;
}

/** The provider APIs appear on `window` a tick after the script's load event. */
export function whenApiReady(): Promise<void> {
  if (captchaDriver === 'turnstile') {
    return new Promise((resolve) => {
      const tick = () => (window.turnstile ? resolve() : setTimeout(tick, 50));
      tick();
    });
  }
  return new Promise((resolve) => {
    const tick = () =>
      window.grecaptcha?.ready ? window.grecaptcha.ready(() => resolve()) : setTimeout(tick, 50);
    tick();
  });
}
