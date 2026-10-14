import { describe, expect, it } from 'vite-plus/test';

import type { StartWatcher } from '#src/watch/watcher.ts';
import { WatcherSet } from '#src/watch/watcher.ts';
import { noop } from '#test/watch-session.ts';

/** A watcher set whose watchers are fakes: it records the paths of each start. */
function watcherSet(): { set: WatcherSet; starts: string[][] } {
  const starts: string[][] = [];
  const start: StartWatcher = async paths => {
    starts.push(paths);
    await Promise.resolve();
    return {
      ready: Promise.resolve(),
      close: async () => {
        await Promise.resolve();
      },
    };
  };
  const set = new WatcherSet({
    start,
    buildDir: '/p/.nuxt',
    onChange: noop,
    onReady: noop,
    warn: noop,
    warnStart: noop,
  });
  return { set, starts };
}

describe('WatcherSet.add', () => {
  it('skips a dir inside a dir that is watched already, also inside the same batch', async () => {
    const { set, starts } = watcherSet();
    await set.startRoot(['/p']);
    set.add(['/ext/app', '/ext', '/p-other']);
    set.add(['/ext/server', '/ext']);
    await Promise.resolve();
    expect(starts).toEqual([['/p'], ['/ext', '/p-other']]);
  });

  it('watches a parent of a dir that is watched already', async () => {
    const { set, starts } = watcherSet();
    await set.startRoot(['/p']);
    set.add(['/base/src']);
    set.add(['/base']);
    await Promise.resolve();
    expect(starts).toEqual([['/p'], ['/base/src'], ['/base']]);
  });
});
