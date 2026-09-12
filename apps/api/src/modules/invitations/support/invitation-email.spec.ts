import { invitationEmail } from './invitation-email';

const EXPIRES = new Date('2026-09-19T14:30:00Z');
const LINK = 'https://app.dontpanic.dev/invite/tok3n';

describe('invitationEmail', () => {
  it('carries the link in both the button and the plain-text part', () => {
    const mail = invitationEmail({
      inviteeName: 'Arthur',
      tenantName: 'Sirius Cybernetics',
      inviterName: 'Marvin',
      link: LINK,
      expiresAt: EXPIRES,
      locale: 'en',
    });

    expect(mail.html).toContain(`href="${LINK}"`);
    // Gateways that strip HTML still have to leave the recipient something to
    // click; an invitation nobody can act on is a support ticket.
    expect(mail.text).toContain(LINK);
    expect(mail.subject).toBe("You're invited to Sirius Cybernetics — DontPanic");
    expect(mail.html).toContain('Marvin invited you to join');
    expect(mail.text).toContain('Marvin invited you to join');
    // …and no leftover markup in the text half.
    expect(mail.text).not.toContain('<strong>');
  });

  it('defaults to pt-BR and drops the inviter when there is none', () => {
    const mail = invitationEmail({
      tenantName: 'Sirius Cybernetics',
      link: LINK,
      expiresAt: EXPIRES,
    });

    expect(mail.subject).toBe('Convite para Sirius Cybernetics — DontPanic');
    expect(mail.html).toContain('Você foi convidado para fazer parte de');
    // No name from the inviter means a greeting without one, not "Olá, null".
    expect(mail.html).toContain('>Olá</h1>');
    expect(mail.text.startsWith('Olá\n')).toBe(true);
  });

  it('names both people in pt-BR too', () => {
    const mail = invitationEmail({
      inviteeName: 'Arthur',
      tenantName: 'Sirius Cybernetics',
      inviterName: 'Marvin',
      link: LINK,
      expiresAt: EXPIRES,
      locale: 'pt-BR',
    });

    expect(mail.html).toContain('>Olá, Arthur</h1>');
    expect(mail.html).toContain('Marvin convidou você para fazer parte de');
    expect(mail.text).toContain('Marvin convidou você para fazer parte de');
  });

  it('falls back to pt-BR for a locale the table does not know', () => {
    const mail = invitationEmail({
      tenantName: 'Sirius',
      link: LINK,
      expiresAt: EXPIRES,
      locale: 'kl-KL' as never,
    });

    expect(mail.subject).toContain('Convite para');
  });

  /**
   * The template renders where the job is enqueued and the recipient has no
   * account yet, so there is no timezone to render in. Labelling UTC is the
   * honest answer; the server's own zone presented as the reader's is what makes
   * someone miss the deadline by a working day.
   */
  it('states the deadline in UTC, whatever the machine thinks the time is', () => {
    const en = invitationEmail({
      tenantName: 'Sirius',
      link: LINK,
      expiresAt: EXPIRES,
      locale: 'en',
    });
    expect(en.text).toContain('(UTC)');
    expect(en.text).toContain('2:30');
    expect(en.text).toContain('September 19, 2026');
  });

  it('escapes everything that came from a human', () => {
    const mail = invitationEmail({
      inviteeName: '<script>alert(1)</script>',
      tenantName: 'Sirius & Co "Ltd"',
      inviterName: "O'Brien",
      link: LINK,
      expiresAt: EXPIRES,
      locale: 'en',
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Sirius &amp; Co &quot;Ltd&quot;');
    expect(mail.html).toContain('O&#39;Brien');
  });
});
