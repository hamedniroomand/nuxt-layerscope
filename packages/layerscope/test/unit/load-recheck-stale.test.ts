import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { createEnvironmentCache } from '#src/analyze/cache.ts';
import type { Environment } from '#src/analyze/environment.ts';
import { assertSymbolsFresh, loadEnvironment } from '#src/analyze/environment.ts';
import { loadProject } from '#src/analyze/load.ts';

vi.mock('#src/analyze/environment.ts', () => ({
  loadEnvironment: vi.fn(async () => {
    await Promise.resolve();
    return { env: { table: {} }, layers: [], registry: null } as unknown as Environment;
  }),
  assertSymbolsFresh: vi.fn(async () => {
    await Promise.resolve();
  }),
}));

// The loads are fakes, so the dir does not have to exist.
const root = join(tmpdir(), 'layerscope-recheck-none');

/** Two loads with the same env key: the second one gets the cached environment. */
async function loadTwice(recheckStale?: boolean): Promise<void> {
  const environment = createEnvironmentCache();
  const options = { rootDir: root, config: {}, envKey: 'k', environment, recheckStale };
  await loadProject(options);
  await loadProject(options);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadProject with a cached environment', () => {
  it('runs the stale check again on a cache hit when recheckStale is set', async () => {
    await loadTwice(true);
    expect(loadEnvironment).toHaveBeenCalledTimes(1);
    expect(assertSymbolsFresh).toHaveBeenCalledTimes(1);
  });

  it('does not run the stale check on a cache hit without recheckStale (the DevTools tab)', async () => {
    await loadTwice();
    expect(loadEnvironment).toHaveBeenCalledTimes(1);
    expect(assertSymbolsFresh).not.toHaveBeenCalled();
  });

  it('does not run the check a second time after a new load', async () => {
    const environment = createEnvironmentCache();
    await loadProject({ rootDir: root, config: {}, envKey: 'k', environment, recheckStale: true });
    expect(loadEnvironment).toHaveBeenCalledTimes(1);
    expect(assertSymbolsFresh).not.toHaveBeenCalled();
  });
});
