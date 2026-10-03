import { describe, expect, it, vi } from 'vite-plus/test';

import { createEnvironmentCache } from '#src/analyze/cache.ts';
import type { Environment } from '#src/analyze/environment.ts';

type Load = () => Promise<Environment>;

const environment = (): Environment => ({}) as Environment;

describe('createEnvironmentCache', () => {
  it('loads once while the key holds and again when it changes', async () => {
    const cache = createEnvironmentCache();
    const load = vi
      .fn<Load>()
      .mockResolvedValueOnce(environment())
      .mockResolvedValueOnce(environment());
    const first = await cache.get('a', load);
    expect(await cache.get('a', load)).toBe(first);
    expect(load).toHaveBeenCalledOnce();
    expect(await cache.get('b', load)).not.toBe(first);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps no failed load', async () => {
    const cache = createEnvironmentCache();
    const load = vi
      .fn<Load>()
      .mockRejectedValueOnce(new Error('broken registry'))
      .mockResolvedValueOnce(environment());
    await expect(cache.get('a', load)).rejects.toThrow('broken registry');
    await expect(cache.get('a', load)).resolves.toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
