import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { formatResult } from '#src/report/index.ts';
import { plain } from '#src/utils/style.ts';
import { watchCheck } from '#src/watch/index.ts';
import type { WatchOptions } from '#src/watch/index.ts';
import type { Change, StartWatcher } from '#src/watch/watcher.ts';

import { page, project, write } from './watch-project.ts';

function noop(): void {
  // Nothing to do.
}

interface Session {
  out: string[];
  err: string[];
  stop: () => Promise<number>;
  change: (change?: Partial<Change>) => void;
}

/** Runs the watch with a watcher that the test drives, and with short delays. */
function start(root: string, format: 'text' | 'json' = 'text', tty = false): Session {
  const out: string[] = [];
  const err: string[] = [];
  const abort = new AbortController();
  let notify: (change: Change) => void = noop;
  const startWatcher: StartWatcher = async (_paths, _buildDir, onChange) => {
    notify = onChange;
    await Promise.resolve();
    return {
      add: noop,
      close: async () => {
        await Promise.resolve();
      },
    };
  };
  const options: WatchOptions = {
    rootDir: root,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
    prepare: false,
    render: result => formatResult(result, format, root, plain),
    human: format === 'text',
    tty,
    write: text => {
      out.push(text);
    },
    warn: text => {
      err.push(text);
    },
    signal: abort.signal,
    delayMs: 5,
    maxWaitMs: 50,
    startWatcher,
  };
  const done = watchCheck(options);
  return {
    out,
    err,
    stop: async () => {
      abort.abort();
      const code = await done;
      return code;
    },
    change: change => {
      notify({ path: join(root, 'x'), config: false, ...change });
    },
  };
}

const joined = (lines: string[]): string => lines.join('');

/** Waits until the text is on the screen (or stderr, for `err`). */
async function seen(lines: string[], text: string, timeout = 5000): Promise<void> {
  await vi.waitFor(
    () => {
      expect(joined(lines)).toContain(text);
    },
    { timeout },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('watchCheck', () => {
  it('shows a new finding, a fixed one, and exits with 0', async () => {
    const root = project();
    const session = start(root);
    await seen(session.out, '0 findings');
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    session.change();
    await seen(session.out, '+1 new  -0 fixed');
    expect(joined(session.out)).toContain('Cannot resolve');
    expect(joined(session.out)).toContain('hint: run nuxi prepare');
    write(root, 'layers/a/app/pages/bad.vue', page('../helper'));
    session.change();
    await seen(session.out, '+0 new  -1 fixed');
    expect(await session.stop()).toBe(0);
  });

  it('says "no change" when a save does not change the result', async () => {
    const root = project();
    const session = start(root);
    await seen(session.out, '0 findings');
    session.change();
    await seen(session.out, 'no change');
    await session.stop();
    // Only the status moved: the report was printed once.
    expect(joined(session.out).split('--- ').length - 1).toBe(1);
  });

  it('keeps watching after a run fails', async () => {
    const root = project();
    const session = start(root);
    await seen(session.out, '0 findings');
    writeFileSync(join(root, 'layerscope.config.mjs'), 'export default {{{');
    session.change({ config: true });
    await seen(session.err, 'layerscope:');
    write(
      root,
      'layerscope.config.mjs',
      "export default { layers: { a: { path: 'layers/a' } } };\n",
    );
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    session.change({ config: true });
    await seen(session.out, 'Cannot resolve');
    expect(await session.stop()).toBe(0);
  });
});

describe('watchCheck output', () => {
  it('writes one document for each run in a machine format, and the status to stderr', async () => {
    const root = project();
    const session = start(root, 'json');
    await vi.waitFor(() => {
      expect(session.out.length).toBe(1);
    });
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    session.change();
    await vi.waitFor(() => {
      expect(session.out.length).toBe(2);
    });
    await session.stop();
    const documents = session.out.map(text => JSON.parse(text) as { findings: unknown[] });
    expect(documents.map(document => document.findings.length)).toEqual([0, 1]);
    expect(joined(session.err)).toContain('watching, Ctrl+C to exit');
  });

  it('clears the screen on a terminal and rewrites the status line when nothing changed', async () => {
    const root = project();
    const session = start(root, 'text', true);
    await seen(session.out, '0 findings');
    expect(session.out[0]).toContain('\u001B[2J');
    session.change();
    await seen(session.out, 'no change');
    expect(joined(session.out)).toContain('\r\u001B[2K');
    await session.stop();
  });
});

describe('watchCheck with the file watcher', () => {
  it('sees a file written to the disk', async () => {
    const root = project();
    const out: string[] = [];
    const abort = new AbortController();
    const done = watchCheck({
      rootDir: root,
      source: 'auto',
      baseline: 'layerscope-baseline.json',
      prepare: false,
      render: result => formatResult(result, 'text', root, plain),
      human: true,
      tty: false,
      write: text => {
        out.push(text);
      },
      warn: noop,
      signal: abort.signal,
      delayMs: 50,
    });
    await seen(out, '0 findings', 20_000);
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    await seen(out, '+1 new  -0 fixed', 20_000);
    write(root, 'layers/a/app/pages/bad.vue', page('../helper'));
    await seen(out, '+0 new  -1 fixed', 20_000);
    abort.abort();
    expect(await done).toBe(0);
  });
});
