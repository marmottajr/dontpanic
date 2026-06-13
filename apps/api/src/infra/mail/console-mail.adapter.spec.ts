import { Logger } from '@nestjs/common';
import { ConsoleMailAdapter } from './console-mail.adapter';

describe('ConsoleMailAdapter', () => {
  let logSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let adapter: ConsoleMailAdapter;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    adapter = new ConsoleMailAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the recipient and subject', async () => {
    await adapter.send({ to: 'a@b.com', subject: 'Hello', html: '<p>hi</p>', text: 'hi' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('a@b.com');
    expect(logged).toContain('Hello');
  });

  it('logs the text body at debug level when present', async () => {
    await adapter.send({ to: 'a@b.com', subject: 'S', html: '<p>html</p>', text: 'text-body' });
    expect(debugSpy).toHaveBeenCalledWith('text-body');
  });

  it('falls back to the html body when there is no text part', async () => {
    await adapter.send({ to: 'a@b.com', subject: 'S', html: '<p>html-only</p>' });
    expect(debugSpy).toHaveBeenCalledWith('<p>html-only</p>');
  });

  it('resolves without throwing', async () => {
    await expect(
      adapter.send({ to: 'x@y.com', subject: 'S', html: 'h' }),
    ).resolves.toBeUndefined();
  });
});
