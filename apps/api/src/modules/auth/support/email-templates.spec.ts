import { verificationCodeEmail } from './email-templates';

describe('verificationCodeEmail', () => {
  it('builds a pt-BR email by default with the code, name and subject', () => {
    const m = verificationCodeEmail({ name: 'Arthur', code: '123456' });
    expect(m.subject).toMatch(/verificação/i);
    expect(m.html).toContain('123456');
    expect(m.html).toContain('Arthur');
    expect(m.text).toContain('123456');
  });

  it('builds an English email when locale=en', () => {
    const m = verificationCodeEmail({ name: 'Ford', code: '654321', locale: 'en' });
    expect(m.subject).toMatch(/verification/i);
    expect(m.html).toContain('654321');
  });

  it('escapes HTML in the name (no injection)', () => {
    const m = verificationCodeEmail({ name: '<script>x</script>', code: '111111' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('falls back to pt-BR for an unknown locale', () => {
    // @ts-expect-error — exercise the defensive locale fallback
    const m = verificationCodeEmail({ name: 'X', code: '222222', locale: 'zz' });
    expect(m.subject).toMatch(/verificação/i);
  });
});
