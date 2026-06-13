export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Port for sending transactional e-mail. Adapters: SMTP, SES, Console. */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
