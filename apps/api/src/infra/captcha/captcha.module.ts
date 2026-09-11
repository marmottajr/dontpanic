import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { CAPTCHA_PROVIDER } from '../../core/captcha/captcha.provider';
import { NoopCaptchaAdapter } from './noop-captcha.adapter';
import { RecaptchaAdapter } from './recaptcha.adapter';
import { TurnstileAdapter } from './turnstile.adapter';

@Global()
@Module({
  providers: [
    {
      provide: CAPTCHA_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const secret = config.get('CAPTCHA_SECRET_KEY', { infer: true });
        const timeoutMs = config.get('CAPTCHA_TIMEOUT', { infer: true });
        const minScore = config.get('CAPTCHA_MIN_SCORE', { infer: true });

        switch (config.get('CAPTCHA_DRIVER', { infer: true })) {
          case 'turnstile':
            return new TurnstileAdapter(secret, timeoutMs);
          case 'recaptcha-v2':
            return new RecaptchaAdapter({ secret, timeoutMs, version: 'v2', minScore });
          case 'recaptcha-v3':
            return new RecaptchaAdapter({ secret, timeoutMs, version: 'v3', minScore });
          default:
            return new NoopCaptchaAdapter();
        }
      },
    },
  ],
  exports: [CAPTCHA_PROVIDER],
})
export class CaptchaModule {}
