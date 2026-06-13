import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import type { MailMessage, MailProvider } from '../../core/mail/mail.provider';

export interface SesConfig {
  region: string;
  accessKey: string;
  secretKey: string;
  from: string;
}

export class SesMailAdapter implements MailProvider {
  private readonly client: SESClient;

  constructor(private readonly config: SesConfig) {
    this.client = new SESClient({
      region: config.region,
      credentials:
        config.accessKey && config.secretKey
          ? { accessKeyId: config.accessKey, secretAccessKey: config.secretKey }
          : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.config.from,
        Destination: { ToAddresses: [message.to] },
        Message: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: message.html, Charset: 'UTF-8' },
            ...(message.text ? { Text: { Data: message.text, Charset: 'UTF-8' } } : {}),
          },
        },
      }),
    );
  }
}
