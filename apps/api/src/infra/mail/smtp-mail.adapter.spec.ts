const sendMail = jest.fn();
const createTransport = jest.fn(() => ({ sendMail }));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport },
}));

import { SmtpMailAdapter, type SmtpConfig } from './smtp-mail.adapter';

const baseConfig: SmtpConfig = {
  host: 'mail.local',
  port: 587,
  secure: false,
  user: 'user',
  password: 'pass',
  from: 'DontPanic <no-reply@dontpanic.dev>',
};

describe('SmtpMailAdapter', () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ messageId: '1' });
    createTransport.mockClear();
  });

  it('builds an authenticated transport when a user is configured', () => {
    new SmtpMailAdapter(baseConfig);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'mail.local',
        port: 587,
        secure: false,
        auth: { user: 'user', pass: 'pass' },
      }),
    );
  });

  it('omits auth when no user is configured', () => {
    new SmtpMailAdapter({ ...baseConfig, user: '' });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it('sends mail with the configured "from" and message fields', async () => {
    const adapter = new SmtpMailAdapter(baseConfig);
    await adapter.send({ to: 'a@b.com', subject: 'Subj', html: '<p>h</p>', text: 't' });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'DontPanic <no-reply@dontpanic.dev>',
      to: 'a@b.com',
      subject: 'Subj',
      html: '<p>h</p>',
      text: 't',
    });
  });

  it('propagates a transport failure', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const adapter = new SmtpMailAdapter(baseConfig);
    await expect(
      adapter.send({ to: 'a@b.com', subject: 'S', html: 'h' }),
    ).rejects.toThrow('smtp down');
  });
});
