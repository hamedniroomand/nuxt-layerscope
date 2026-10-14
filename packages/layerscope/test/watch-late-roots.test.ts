import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vite-plus/test';

import { createOutsideServerProject } from './outside-server-project.ts';
import { outsideProject, page, write } from './watch-project.ts';
import { joined, noop, seen, start } from './watch-session.ts';
import type { OnBatch, Session } from './watch-session.ts';

/**
 * The `ready` of a batch: it saves a file 100 ms later, longer than the trigger delay, and then
 * ends the scan. No event comes for the file, so only a run after the scan sees it.
 */
function saveThenReady(save: () => void): OnBatch {
  return async () => {
    await new Promise(resolve => {
      setTimeout(resolve, 100);
    });
    save();
  };
}

/** Starts the watch and waits for the first report. */
async function started(root: string, onBatch?: OnBatch): Promise<Session> {
  const session = start(root, 'text', false, {}, onBatch);
  await seen(session.out, '0 findings');
  return session;
}

describe('watchCheck with a layer dir outside the root (#135)', () => {
  it('runs again when the new watcher is ready, and sees a file saved before it', async () => {
    const { root, outside } = outsideProject();
    const session = await started(
      root,
      saveThenReady(() => {
        write(outside, 'app/pages/bad.vue', page('./missing'));
      }),
    );
    await seen(session.out, '+1 new  -0 fixed');
    expect(joined(session.out)).toContain('Cannot resolve');
    expect(await session.stop()).toBe(0);
    // The run after the batch finds no new dir, so it starts no other watcher.
    expect(session.starts.slice(1)).toEqual([[outside]]);
  });

  it('warns once when a new watcher cannot start, and goes on', async () => {
    const { root, outside } = outsideProject();
    const session = await started(root, () => {
      throw new Error('EMFILE: too many open files');
    });
    await seen(
      session.err,
      `layerscope: Cannot watch ${outside}: EMFILE: too many open files. Changes in these dirs are not seen until the watch starts again.\n`,
    );
    session.change();
    await seen(session.out, 'no change');
    expect(await session.stop()).toBe(0);
    expect(joined(session.err).split('Cannot watch').length - 1).toBe(1);
    expect(session.starts).toHaveLength(2);
  });

  it('stops at once while the first scan of a new watcher goes on, and closes that watcher', async () => {
    const { root } = outsideProject();
    // The scan never ends.
    const session = await started(root, async () => {
      await new Promise(noop);
    });
    await vi.waitFor(() => {
      expect(session.starts).toHaveLength(2);
    });
    expect(await session.stop()).toBe(0);
    expect(session.closed()).toBe(2);
  });
});

describe('watchCheck with a serverDir outside the layer root (#135)', () => {
  it('runs again when the new watcher is ready, and sees a file saved before it', async () => {
    const project = createOutsideServerProject();
    const session = start(
      project.root,
      'text',
      false,
      {},
      saveThenReady(() => {
        // A second import of the `shop` layer from `../api`, which is a violation too.
        write(project.api, 'utils/y.ts', readFileSync(project.files.violation, 'utf8'));
      }),
    );
    await seen(session.out, '2 findings', 20_000);
    await seen(session.out, '+1 new  -0 fixed', 20_000);
    expect(await session.stop()).toBe(0);
    expect(session.starts.slice(1)).toEqual([[project.api]]);
  });
});
