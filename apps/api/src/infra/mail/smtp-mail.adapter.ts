import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailProvider } from '../../core/mail/mail.provider';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

/** Works with Mailpit (dev), Gmail, Postmark SMTP, etc. */
export class SmtpMailAdapter implements MailProvider {
  private readonly logger = new Logger(SmtpMailAdapter.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    this.logger.debug(`Sent "${message.subject}" to ${message.to}`);
  }
}
