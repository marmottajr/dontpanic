import { QueueHealthIndicator } from './queue.health';

describe('QueueHealthIndicator', () => {
  let queue: { ping: jest.Mock };
  let session: { up: jest.Mock; down: jest.Mock };
  let healthIndicatorService: { check: jest.Mock };
  let indicator: QueueHealthIndicator;

  beforeEach(() => {
    session = {
      up: jest.fn().mockReturnValue({ queue: { status: 'up' } }),
      down: jest.fn().mockReturnValue({ queue: { status: 'down' } }),
    };
    healthIndicatorService = { check: jest.fn().mockReturnValue(session) };
    queue = { ping: jest.fn() };
    indicator = new QueueHealthIndicator(healthIndicatorService as never, queue as never);
  });

  it('reports up when the queue ping succeeds', async () => {
    queue.ping.mockResolvedValue(undefined);
    const res = await indicator.isHealthy('queue');
    expect(healthIndicatorService.check).toHaveBeenCalledWith('queue');
    expect(session.up).toHaveBeenCalled();
    expect(res).toEqual({ queue: { status: 'up' } });
  });

  it('reports down with the error message when the ping throws', async () => {
    // An unreachable queue means every background job — transactional mail
    // included — is silently piling up, which nothing on the request path shows.
    queue.ping.mockRejectedValue(new Error('no redis'));
    const res = await indicator.isHealthy('queue');
    expect(session.down).toHaveBeenCalledWith({ message: 'no redis' });
    expect(session.up).not.toHaveBeenCalled();
    expect(res).toEqual({ queue: { status: 'down' } });
  });

  it('stringifies a non-Error rejection', async () => {
    queue.ping.mockRejectedValue('boom');
    await indicator.isHealthy('queue');
    expect(session.down).toHaveBeenCalledWith({ message: 'boom' });
  });
});
