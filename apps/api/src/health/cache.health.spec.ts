import { CacheHealthIndicator } from './cache.health';

describe('CacheHealthIndicator', () => {
  let cache: { ping: jest.Mock };
  let session: { up: jest.Mock; down: jest.Mock };
  let healthIndicatorService: { check: jest.Mock };
  let indicator: CacheHealthIndicator;

  beforeEach(() => {
    session = {
      up: jest.fn().mockReturnValue({ cache: { status: 'up' } }),
      down: jest.fn().mockReturnValue({ cache: { status: 'down' } }),
    };
    healthIndicatorService = { check: jest.fn().mockReturnValue(session) };
    cache = { ping: jest.fn() };
    indicator = new CacheHealthIndicator(healthIndicatorService as never, cache as never);
  });

  it('reports up when the cache ping succeeds', async () => {
    cache.ping.mockResolvedValue(undefined);
    const res = await indicator.isHealthy('cache');
    expect(healthIndicatorService.check).toHaveBeenCalledWith('cache');
    expect(session.up).toHaveBeenCalled();
    expect(res).toEqual({ cache: { status: 'up' } });
  });

  it('reports down with the error message when the ping throws', async () => {
    cache.ping.mockRejectedValue(new Error('no redis'));
    const res = await indicator.isHealthy('cache');
    expect(session.down).toHaveBeenCalledWith({ message: 'no redis' });
    expect(res).toEqual({ cache: { status: 'down' } });
  });

  it('stringifies a non-Error rejection', async () => {
    cache.ping.mockRejectedValue('boom');
    await indicator.isHealthy('cache');
    expect(session.down).toHaveBeenCalledWith({ message: 'boom' });
  });
});
