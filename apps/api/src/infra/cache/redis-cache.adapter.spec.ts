const mockClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  quit: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockClient),
}));

import Redis from 'ioredis';
import { RedisCacheAdapter } from './redis-cache.adapter';

describe('RedisCacheAdapter', () => {
  let adapter: RedisCacheAdapter;

  beforeEach(() => {
    adapter = new RedisCacheAdapter('redis://localhost:6379');
  });

  it('constructs an ioredis client with the given url', () => {
    expect(Redis).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ maxRetriesPerRequest: null }),
    );
  });

  it('get delegates to client.get', async () => {
    mockClient.get.mockResolvedValue('value');
    expect(await adapter.get('k')).toBe('value');
    expect(mockClient.get).toHaveBeenCalledWith('k');
  });

  it('set with TTL uses EX', async () => {
    mockClient.set.mockResolvedValue('OK');
    await adapter.set('k', 'v', 30);
    expect(mockClient.set).toHaveBeenCalledWith('k', 'v', 'EX', 30);
  });

  it('set without TTL omits EX', async () => {
    mockClient.set.mockResolvedValue('OK');
    await adapter.set('k', 'v');
    expect(mockClient.set).toHaveBeenCalledWith('k', 'v');
  });

  it('del delegates to client.del', async () => {
    mockClient.del.mockResolvedValue(1);
    await adapter.del('k');
    expect(mockClient.del).toHaveBeenCalledWith('k');
  });

  it('incr sets expiry only on the first increment (value === 1)', async () => {
    mockClient.incr.mockResolvedValue(1);
    expect(await adapter.incr('k', 60)).toBe(1);
    expect(mockClient.expire).toHaveBeenCalledWith('k', 60);
  });

  it('incr does not set expiry on subsequent increments', async () => {
    mockClient.incr.mockResolvedValue(2);
    expect(await adapter.incr('k', 60)).toBe(2);
    expect(mockClient.expire).not.toHaveBeenCalled();
  });

  it('incr without TTL never calls expire', async () => {
    mockClient.incr.mockResolvedValue(1);
    await adapter.incr('k');
    expect(mockClient.expire).not.toHaveBeenCalled();
  });

  it('onModuleDestroy quits the client', async () => {
    mockClient.quit.mockResolvedValue('OK');
    await adapter.onModuleDestroy();
    expect(mockClient.quit).toHaveBeenCalled();
  });
});
