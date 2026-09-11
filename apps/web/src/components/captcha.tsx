'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useTheme } from 'next-themes';
import {
  captchaDriver,
  captchaEnabled,
  captchaSiteKey,
  loadCaptchaScript,
  whenApiReady,
} from '@/lib/captcha';

export interface CaptchaHandle {
  /** The token to submit, or null when the user has not solved it yet. */
  getToken: () => Promise<string | null>;
  /** Clear the widget. Tokens are single-use — call this after a failed submit. */
  reset: () => void;
}

interface CaptchaProps {
  /** Route purpose, checked server-side by reCAPTCHA v3. */
  action: string;
  className?: string;
}

/**
 * Renders the configured challenge, or nothing at all when CAPTCHA_DRIVER is
 * `none` — so every form can mount it unconditionally.
 *
 * reCAPTCHA v3 has no visible widget: `getToken` asks for a fresh score at
 * submit time. v2 and Turnstile draw a box and hand us a token via callback.
 */
export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha(
  { action, className },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | number | null>(null);
  const tokenRef = useRef<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!captchaEnabled || captchaDriver === 'recaptcha-v3') return;

    let cancelled = false;
    void (async () => {
      try {
        await loadCaptchaScript();
        await whenApiReady();
      } catch {
        return; // offline or blocked: submit will report the missing token
      }
      // StrictMode mounts effects twice in dev; never draw a second widget.
      if (cancelled || !hostRef.current || widgetId.current !== null) return;

      const onToken = (token: string) => {
        tokenRef.current = token;
      };
      const onGone = () => {
        tokenRef.current = null;
      };

      if (captchaDriver === 'turnstile') {
        widgetId.current =
          window.turnstile?.render(hostRef.current, {
            sitekey: captchaSiteKey,
            action,
            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            callback: onToken,
            'expired-callback': onGone,
            'error-callback': onGone,
          }) ?? null;
      } else {
        widgetId.current =
          window.grecaptcha?.render(hostRef.current, {
            sitekey: captchaSiteKey,
            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            callback: onToken,
            'expired-callback': onGone,
            'error-callback': onGone,
          }) ?? null;
      }
    })();

    return () => {
      cancelled = true;
      if (captchaDriver === 'turnstile' && typeof widgetId.current === 'string') {
        window.turnstile?.remove(widgetId.current);
      }
      // grecaptcha has no remove(); dropping the host's children is the
      // documented way to let a remount render cleanly.
      if (hostRef.current) hostRef.current.innerHTML = '';
      widgetId.current = null;
      tokenRef.current = null;
    };
  }, [action, resolvedTheme]);

  useImperativeHandle(
    ref,
    () => ({
      getToken: async () => {
        if (!captchaEnabled) return null;
        if (captchaDriver !== 'recaptcha-v3') return tokenRef.current;
        try {
          await loadCaptchaScript();
          await whenApiReady();
          return (await window.grecaptcha?.execute(captchaSiteKey, { action })) ?? null;
        } catch {
          return null;
        }
      },
      reset: () => {
        tokenRef.current = null;
        if (captchaDriver === 'turnstile' && typeof widgetId.current === 'string') {
          window.turnstile?.reset(widgetId.current);
        } else if (typeof widgetId.current === 'number') {
          window.grecaptcha?.reset(widgetId.current);
        }
      },
    }),
    [action],
  );

  // v3 is invisible and `none` renders nothing, so neither leaves a gap in the form.
  if (!captchaEnabled || captchaDriver === 'recaptcha-v3') return null;

  return <div ref={hostRef} className={className} data-testid="captcha" />;
});
