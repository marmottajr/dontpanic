import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { MAIL_PROVIDER } from '../../core/mail/mail.provider';
import { ConsoleMailAdapter } from './console-mail.adapter';
import { SesMailAdapter } from './ses-mail.adapter';
import { SmtpMailAdapter } from './smtp-mail.adapter';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const from = config.get('MAIL_FROM', { infer: true });
        switch (config.get('MAIL_DRIVER', { infer: true })) {
          case 'console':
            return new ConsoleMailAdapter();
          case 'ses':
            return new SesMailAdapter({
              region: config.get('AWS_REGION', { infer: true }),
              accessKey: config.get('SES_ACCESS_KEY', { infer: true }),
              secretKey: config.get('SES_SECRET_KEY', { infer: true }),
              from,
            });
          default:
            return new SmtpMailAdapter({
              host: config.get('MAIL_HOST', { infer: true }),
              port: config.get('MAIL_PORT', { infer: true }),
              secure: config.get('MAIL_SECURE', { infer: true }),
              user: config.get('MAIL_USER', { infer: true }),
              password: config.get('MAIL_PASSWORD', { infer: true }),
              from,
            });
        }
      },
    },
  ],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
