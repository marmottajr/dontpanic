import { Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from '../../core/mail/mail.provider';

/** Logs e-mails instead of sending. Used in tests and offline dev. */
export class ConsoleMailAdapter implements MailProvider {
  private readonly logger = new Logger('ConsoleMail');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`📧 To: ${message.to} · Subject: ${message.subject}`);
    this.logger.debug(message.text ?? message.html);
  }
}
