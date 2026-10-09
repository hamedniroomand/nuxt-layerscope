import { unlinkSync, writeFileSync } from 'node:fs';

import { basename, dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { formatResult } from '#src/report/index.ts';
import { plain } from '#src/utils/style.ts';
import { watchCheck } from '#src/watch/index.ts';
import type { WatchOptions } from '#src/watch/index.ts';
import type { Change, StartWatcher } from '#src/watch/watcher.ts';

import { page, project, tempDir, write } from './watch-project.ts';

function noop(): void {
  // Nothing to do.
}

interface Session {
  /** The paths given to the watcher at the start, and the ones added later. */
  watched: string[];
  added: string[];
  out: string[];
  err: string[];
  stop: () => Promise<number>;
  change: (change?: Partial<Change>) => void;
}

/** A watcher the test drives: it records the paths and sends the changes it is told to. */
function fakeWatcher(): {
  startWatcher: StartWatcher;
  watched: string[];
  added: string[];
  send: (change: Change) => void;
} {
  const watched: string[] = [];
  const added: string[] = [];
  const handlers: ((change: Change) => void)[] = [];
  const startWatcher: StartWatcher = async (paths, _buildDir, onChange) => {
    handlers.push(onChange);
    watched.push(...paths);
    await Promise.resolve();
    return {
      add: more => {
        added.push(...more);
      },
      close: async () => {
        await Promise.resolve();
      },
    };
  };
  return {
    startWatcher,
    watched,
    added,
    send: change => {
      for (const handler of handlers) {
        handler(change);
      }
    },
  };
}

/** Runs the watch with a watcher that the test drives, and with short delays. */
function start(
  root: string,
  format: 'text' | 'json' = 'text',
  tty = false,
  extra: Partial<WatchOptions> = {},
): Session {
  const { startWatcher, watched, added, send } = fakeWatcher();
  const out: string[] = [];
  const err: string[] = [];
  const abort = new AbortController();
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
    ...extra,
  };
  const done = watchCheck(options);
  return {
    watched,
    added,
    out,
    err,
    stop: async () => {
      abort.abort();
      const code = await done;
      return code;
    },
    change: change => {
      send({ path: join(root, 'x'), config: false, ...change });
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

describe('watchCheck inputs', () => {
  it('watches a layer outside the root, also when it appears after the first run', async () => {
    const root = project();
    const outside = join(dirname(root), `${basename(root)}-ext`);
    write(outside, 'app/ext.ts', 'export default 1;\n');
    // A `.ts` config: Node caches a `.mjs` module, so it cannot be read again.
    unlinkSync(join(root, 'layerscope.config.mjs'));
    write(
      root,
      'layerscope.config.ts',
      "export default { layers: { a: { path: 'layers/a' } } };\n",
    );
    const session = start(root);
    await seen(session.out, '0 findings');
    expect(session.added).toEqual([]);
    write(
      root,
      'layerscope.config.ts',
      `export default { layers: { a: { path: 'layers/a' }, ext: { path: '../${basename(outside)}' } } };\n`,
    );
    session.change({ config: true });
    await vi.waitFor(
      () => {
        expect(session.added, joined(session.err)).toEqual([outside]);
      },
      { timeout: 5000 },
    );
    await session.stop();
  });
});

describe('watchCheck inputs of the report', () => {
  it('prints the report again when only the baseline file changed', async () => {
    const root = project();
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    const found = await analyze({ rootDir: root });
    const file = join(root, 'layerscope-baseline.json');
    writeBaseline(file, createBaseline(found.findings, root));
    const session = start(root);
    await seen(session.out, '0 findings');
    expect(joined(session.out)).toContain('1 more in the baseline');
    const baseline = createBaseline(found.findings, root);
    baseline.entries.push({
      rule: 'layer-boundary',
      file: 'layers/a/gone.ts',
      symbol: 'x',
      toLayer: 'b',
    });
    writeBaseline(file, baseline);
    session.change();
    await seen(session.out, '1 fixed entry');
    await session.stop();
  });

  it('watches the file of --config, wherever it is', async () => {
    const root = project();
    const configFile = join(tempDir(), 'custom.config.mjs');
    writeFileSync(configFile, "export default { layers: { a: { path: 'layers/a' } } };\n");
    const session = start(root, 'text', false, { configFile });
    await seen(session.out, '0 findings');
    expect(session.watched).toEqual([root, configFile]);
    await session.stop();
  });
});
