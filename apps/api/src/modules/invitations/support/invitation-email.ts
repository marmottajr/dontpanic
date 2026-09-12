import type { EmailLocale } from '../../auth/support/email-templates';

/**
 * The invitation e-mail — the only place the raw token ever appears.
 *
 * Same shape as `auth/support/email-templates.ts` (locale table, `esc`, inline
 * styles, table layout) rather than a shared renderer: e-mail clients punish
 * abstraction, and the two templates diverge in body but not in chrome.
 */

interface InviteStrings {
  subject: (tenant: string) => string;
  preview: (tenant: string) => string;
  greeting: (name: string | null) => string;
  intro: string;
  body: (tenant: string, inviter: string | null) => string;
  cta: string;
  fallback: string;
  expires: (when: string) => string;
  ignore: string;
}

const STRINGS: Record<EmailLocale, InviteStrings> = {
  'pt-BR': {
    subject: (tenant) => `Convite para ${tenant} — DontPanic`,
    preview: (tenant) => `Você foi convidado para ${tenant} no DontPanic`,
    greeting: (name) => (name ? `Olá, ${name}` : 'Olá'),
    intro: 'Não entre em pânico.',
    body: (tenant, inviter) =>
      inviter
        ? `${inviter} convidou você para fazer parte de <strong>${tenant}</strong> no DontPanic.`
        : `Você foi convidado para fazer parte de <strong>${tenant}</strong> no DontPanic.`,
    cta: 'Aceitar o convite',
    fallback: 'Se o botão não funcionar, copie este endereço para o navegador:',
    expires: (when) => `Este convite expira em ${when}.`,
    ignore: 'Se você não esperava este convite, pode ignorar este e-mail.',
  },
  en: {
    subject: (tenant) => `You're invited to ${tenant} — DontPanic`,
    preview: (tenant) => `You've been invited to ${tenant} on DontPanic`,
    greeting: (name) => (name ? `Hello, ${name}` : 'Hello'),
    intro: "Don't Panic.",
    body: (tenant, inviter) =>
      inviter
        ? `${inviter} invited you to join <strong>${tenant}</strong> on DontPanic.`
        : `You have been invited to join <strong>${tenant}</strong> on DontPanic.`,
    cta: 'Accept the invitation',
    fallback: "If the button doesn't work, copy this address into your browser:",
    expires: (when) => `This invitation expires on ${when}.`,
    ignore: "If you weren't expecting this invitation, you can safely ignore this email.",
  },
};

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Consolas,monospace";

/**
 * The deadline is rendered in UTC, spelled out.
 *
 * The template is rendered where the job is enqueued, and nothing on an
 * invitation records the recipient's timezone — they do not have an account
 * yet. A time labelled UTC is honest; the server's own timezone silently
 * presented as the reader's is the version that makes someone miss a deadline
 * by a working day.
 */
function formatDeadline(date: Date, locale: EmailLocale): string {
  const formatted = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
  return `${formatted} (UTC)`;
}

export function invitationEmail(params: {
  inviteeName?: string | null;
  tenantName: string;
  inviterName?: string | null;
  link: string;
  expiresAt: Date;
  locale?: EmailLocale;
}): { subject: string; html: string; text: string } {
  const locale = params.locale ?? 'pt-BR';
  const t = STRINGS[locale] ?? STRINGS['pt-BR'];

  const tenant = esc(params.tenantName);
  const inviter = params.inviterName ? esc(params.inviterName) : null;
  const invitee = params.inviteeName ? esc(params.inviteeName) : null;
  // The link carries the token. It is escaped like everything else — the token
  // itself is base64url and cannot break out of an attribute, but a template
  // that only escapes what is currently unsafe is one refactor from being wrong.
  const link = esc(params.link);
  const deadline = esc(formatDeadline(params.expiresAt, locale));

  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${esc(t.subject(params.tenantName))}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0e14;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(t.preview(params.tenantName))}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#14181f;border:1px solid #262b36;border-radius:16px;">
            <tr><td style="padding:30px 36px 6px;">
              <div style="font-family:${MONO};font-size:13px;font-weight:700;letter-spacing:2px;color:#34d399;">DON'T&nbsp;PANIC <span style="color:#fbbf24;">· 42</span></div>
            </td></tr>
            <tr><td style="padding:6px 36px 0;">
              <h1 style="margin:0 0 6px;font-family:${SANS};font-size:22px;font-weight:700;color:#e8eaed;">${t.greeting(invitee)}</h1>
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.55;color:#9aa3b2;">${t.intro}</p>
              <p style="margin:14px 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:#9aa3b2;">${t.body(tenant, inviter)}</p>
            </td></tr>
            <tr><td align="center" style="padding:24px 36px 6px;">
              <a href="${link}" style="display:inline-block;font-family:${SANS};font-size:15px;font-weight:700;color:#0b0e14;background:#34d399;border-radius:10px;padding:14px 28px;text-decoration:none;">${t.cta}</a>
            </td></tr>
            <tr><td style="padding:14px 36px 0;">
              <p style="margin:0;font-family:${SANS};font-size:12px;color:#6b7486;">${t.fallback}</p>
              <p style="margin:6px 0 0;font-family:${MONO};font-size:12px;line-height:1.5;color:#9aa3b2;word-break:break-all;">${link}</p>
            </td></tr>
            <tr><td style="padding:18px 36px 28px;">
              <p style="margin:0;font-family:${SANS};font-size:13px;color:#6b7486;">${t.expires(deadline)}</p>
              <p style="margin:10px 0 0;font-family:${SANS};font-size:12px;color:#565f70;">${t.ignore}</p>
            </td></tr>
          </table>
          <p style="margin:18px 0 0;font-family:${MONO};font-size:11px;color:#3f4757;">DontPanic · the answer is 42</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // The plain-text part is not a courtesy: a fair number of corporate gateways
  // strip HTML, and an invitation the recipient cannot act on is a support
  // ticket. The link appears bare so those clients still linkify it.
  const plainBody = t
    .body(params.tenantName, params.inviterName ?? null)
    .replace(/<\/?strong>/g, '');
  const text = [
    t.greeting(params.inviteeName ?? null),
    '',
    t.intro,
    plainBody,
    '',
    `  ${params.link}`,
    '',
    t.expires(formatDeadline(params.expiresAt, locale)),
    t.ignore,
    '',
    'DontPanic · 42',
  ].join('\n');

  return { subject: t.subject(params.tenantName), html, text };
}
