const send = jest.fn();
const SESClient = jest.fn().mockImplementation(() => ({ send }));
const SendEmailCommand = jest.fn().mockImplementation((input: unknown) => ({ input }));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient,
  SendEmailCommand,
}));

import { SesMailAdapter, type SesConfig } from './ses-mail.adapter';

const baseConfig: SesConfig = {
  region: 'us-east-1',
  accessKey: 'AKIA',
  secretKey: 'secret',
  from: 'no-reply@dontpanic.dev',
};

describe('SesMailAdapter', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ MessageId: 'm1' });
    SESClient.mockClear();
    SendEmailCommand.mockClear();
  });

  it('configures the SES client with explicit credentials when present', () => {
    new SesMailAdapter(baseConfig);
    expect(SESClient).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        credentials: { accessKeyId: 'AKIA', secretAccessKey: 'secret' },
      }),
    );
  });

  it('uses the default credential chain when keys are blank', () => {
    new SesMailAdapter({ ...baseConfig, accessKey: '', secretKey: '' });
    expect(SESClient).toHaveBeenCalledWith(
      expect.objectContaining({ credentials: undefined }),
    );
  });

  it('sends a SendEmailCommand with html and text bodies', async () => {
    const adapter = new SesMailAdapter(baseConfig);
    await adapter.send({ to: 'a@b.com', subject: 'Subj', html: '<p>h</p>', text: 'plain' });

    expect(send).toHaveBeenCalledTimes(1);
    const cmdInput = SendEmailCommand.mock.calls[0][0];
    expect(cmdInput.Source).toBe('no-reply@dontpanic.dev');
    expect(cmdInput.Destination.ToAddresses).toEqual(['a@b.com']);
    expect(cmdInput.Message.Subject.Data).toBe('Subj');
    expect(cmdInput.Message.Body.Html.Data).toBe('<p>h</p>');
    expect(cmdInput.Message.Body.Text.Data).toBe('plain');
  });

  it('omits the Text body when no text part is given', async () => {
    const adapter = new SesMailAdapter(baseConfig);
    await adapter.send({ to: 'a@b.com', subject: 'S', html: '<p>h</p>' });
    const cmdInput = SendEmailCommand.mock.calls[0][0];
    expect(cmdInput.Message.Body.Text).toBeUndefined();
  });
});
