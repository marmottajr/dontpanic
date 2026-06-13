export type EmailLocale = 'pt-BR' | 'en';

interface CodeStrings {
  subject: string;
  preview: string;
  greeting: (name: string) => string;
  intro: string;
  body: string;
  expires: string;
  ignore: string;
}

const STRINGS: Record<EmailLocale, CodeStrings> = {
  'pt-BR': {
    subject: 'Seu código de verificação — DontPanic',
    preview: 'Seu código de verificação do DontPanic',
    greeting: (n) => `Olá, ${n}`,
    intro: 'Bem-vindo a bordo. Não entre em pânico.',
    body: 'Use o código abaixo para confirmar seu endereço de e-mail:',
    expires: 'Este código expira em 15 minutos.',
    ignore: 'Se você não criou esta conta, pode ignorar este e-mail.',
  },
  en: {
    subject: 'Your verification code — DontPanic',
    preview: 'Your DontPanic verification code',
    greeting: (n) => `Hello, ${n}`,
    intro: "Welcome aboard. Don't Panic.",
    body: 'Use the code below to confirm your email address:',
    expires: 'This code expires in 15 minutes.',
    ignore: "If you didn't create this account, you can safely ignore this email.",
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
 * Verification-code email in the DontPanic palette (deep-space card, phosphor
 * green brand, amber "42" code box, mono code). Inline styles + table layout
 * for broad email-client support.
 */
export function verificationCodeEmail(params: {
  name: string;
  code: string;
  locale?: EmailLocale;
}): { subject: string; html: string; text: string } {
  const t = STRINGS[params.locale ?? 'pt-BR'] ?? STRINGS['pt-BR'];
  const name = esc(params.name);
  const code = esc(params.code);

  const html = `<!doctype html>
<html lang="${params.locale ?? 'pt-BR'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${t.subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0e14;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.preview}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#14181f;border:1px solid #262b36;border-radius:16px;">
            <tr><td style="padding:30px 36px 6px;">
              <div style="font-family:${MONO};font-size:13px;font-weight:700;letter-spacing:2px;color:#34d399;">DON'T&nbsp;PANIC <span style="color:#fbbf24;">· 42</span></div>
            </td></tr>
            <tr><td style="padding:6px 36px 0;">
              <h1 style="margin:0 0 6px;font-family:${SANS};font-size:22px;font-weight:700;color:#e8eaed;">${t.greeting(name)}</h1>
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.55;color:#9aa3b2;">${t.intro}</p>
              <p style="margin:14px 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:#9aa3b2;">${t.body}</p>
            </td></tr>
            <tr><td style="padding:18px 36px;">
              <div style="font-family:${MONO};font-size:38px;line-height:1;letter-spacing:12px;font-weight:700;color:#fbbf24;text-align:center;padding:22px 12px;background:#0f1320;border:1px solid #2a3142;border-radius:12px;">${code}</div>
            </td></tr>
            <tr><td style="padding:0 36px 28px;">
              <p style="margin:0;font-family:${SANS};font-size:13px;color:#6b7486;">${t.expires}</p>
              <p style="margin:10px 0 0;font-family:${SANS};font-size:12px;color:#565f70;">${t.ignore}</p>
            </td></tr>
          </table>
          <p style="margin:18px 0 0;font-family:${MONO};font-size:11px;color:#3f4757;">DontPanic · the answer is 42</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${t.greeting(params.name)}\n\n${t.intro}\n${t.body}\n\n  ${params.code}\n\n${t.expires}\n${t.ignore}\n\nDontPanic · 42`;
  return { subject: t.subject, html, text };
}
