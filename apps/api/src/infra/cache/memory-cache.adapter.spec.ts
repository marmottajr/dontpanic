import { MemoryCacheAdapter } from './memory-cache.adapter';

describe('MemoryCacheAdapter', () => {
  let cache: MemoryCacheAdapter;

  beforeEach(() => {
    cache = new MemoryCacheAdapter();
  });

  it('returns null for a missing key', async () => {
    expect(await cache.get('nope')).toBeNull();
  });

  it('round-trips a value with set/get', async () => {
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
  });

  it('overwrites an existing value', async () => {
    await cache.set('k', 'one');
    await cache.set('k', 'two');
    expect(await cache.get('k')).toBe('two');
  });

  it('deletes a key', async () => {
    await cache.set('k', 'v');
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('del on a missing key is a no-op', async () => {
    await expect(cache.del('ghost')).resolves.toBeUndefined();
  });

  describe('incr', () => {
    it('starts at 1 for a fresh key', async () => {
      expect(await cache.incr('count')).toBe(1);
    });

    it('increments an existing counter', async () => {
      await cache.incr('count');
      await cache.incr('count');
      expect(await cache.incr('count')).toBe(3);
      expect(await cache.get('count')).toBe('3');
    });

    it('coerces a previously set numeric string', async () => {
      await cache.set('count', '41');
      expect(await cache.incr('count')).toBe(42);
    });
  });

  describe('TTL expiry (fake timers)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns the value before the TTL elapses', async () => {
      await cache.set('k', 'v', 10);
      jest.advanceTimersByTime(9_000);
      expect(await cache.get('k')).toBe('v');
    });

    it('returns null once the TTL has elapsed', async () => {
      await cache.set('k', 'v', 10);
      jest.advanceTimersByTime(10_001);
      expect(await cache.get('k')).toBeNull();
    });

    it('never expires when no TTL is given', async () => {
      await cache.set('k', 'v');
      jest.advanceTimersByTime(1_000_000_000);
      expect(await cache.get('k')).toBe('v');
    });

    it('keeps the original TTL window across incr calls', async () => {
      await cache.incr('count', 10); // first write sets expiry at +10s
      jest.advanceTimersByTime(5_000);
      await cache.incr('count', 10); // must NOT extend the window
      jest.advanceTimersByTime(5_001); // now past the original 10s
      expect(await cache.get('count')).toBeNull();
    });

    it('incr after expiry restarts the counter and the TTL', async () => {
      await cache.incr('count', 10);
      jest.advanceTimersByTime(10_001);
      // Prior entry is expired; incr should restart at 1 with a fresh window.
      expect(await cache.incr('count', 10)).toBe(1);
    });
  });
});
