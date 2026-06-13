import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { marvinQuip } from '../marvin';

function makeHost(request: Record<string, unknown> = { id: 'req-1' }) {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as never;
  return { host, reply };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('maps a known HttpException to its status, message and Marvin quip', () => {
    const { host, reply } = makeHost();
    filter.catch(new NotFoundException('No such thing'), host);

    expect(reply.status).toHaveBeenCalledWith(404);
    const body = reply.send.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: 404,
      message: 'No such thing',
      marvin: marvinQuip(404),
      requestId: 'req-1',
    });
  });

  it('preserves the validation message array from a BadRequestException', () => {
    const { host, reply } = makeHost();
    filter.catch(new BadRequestException(['email must be an email', 'name required']), host);

    const body = reply.send.mock.calls[0][0];
    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual(['email must be an email', 'name required']);
  });

  it('handles a string-response HttpException', () => {
    const { host, reply } = makeHost();
    filter.catch(new HttpException('teapot', 418), host);
    const body = reply.send.mock.calls[0][0];
    expect(body.statusCode).toBe(418);
    expect(body.message).toBe('teapot');
    expect(body.marvin).toBe(marvinQuip(418));
  });

  it('never leaks internals on an unknown (non-HttpException) error → 500', () => {
    const { host, reply } = makeHost();
    filter.catch(new Error('DB password is hunter2'), host);

    expect(reply.status).toHaveBeenCalledWith(500);
    const body = reply.send.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.error).toBe('InternalServerError');
  });

  it('logs the real cause server-side on 5xx', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error');
    const { host } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(errorSpy).toHaveBeenCalled();
  });
});
