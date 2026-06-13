import { CacheThrottlerStorage } from './cache-throttler.storage';

describe('CacheThrottlerStorage', () => {
  let cache: { incr: jest.Mock; ttl: jest.Mock };
  let storage: CacheThrottlerStorage;

  beforeEach(() => {
    cache = { incr: jest.fn(), ttl: jest.fn() };
    storage = new CacheThrottlerStorage(cache as never);
  });

  it('counts a hit under the limit and reports not-blocked', async () => {
    cache.incr.mockResolvedValue(3);
    cache.ttl.mockResolvedValue(42);
    const rec = await storage.increment('1.2.3.4', 60_000, 5, 0, 'default');
    // ttl passed to incr is the window in seconds (60_000ms -> 60s).
    expect(cache.incr).toHaveBeenCalledWith('throttle:default:1.2.3.4', 60);
    expect(rec).toEqual({
      totalHits: 3,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('blocks once the count exceeds the limit', async () => {
    cache.incr.mockResolvedValue(6);
    cache.ttl.mockResolvedValue(30);
    const rec = await storage.increment('1.2.3.4', 60_000, 5, 0, 'default');
    expect(rec.isBlocked).toBe(true);
    expect(rec.timeToBlockExpire).toBe(30);
  });

  it('falls back to the window ttl when the cache reports no expiry', async () => {
    cache.incr.mockResolvedValue(1);
    cache.ttl.mockResolvedValue(0);
    const rec = await storage.increment('1.2.3.4', 1_000, 5, 0, 'default');
    expect(rec.timeToExpire).toBe(1);
  });
});
