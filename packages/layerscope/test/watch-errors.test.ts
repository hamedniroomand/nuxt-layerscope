import { EventEmitter } from 'node:events';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { formatResult } from '#src/report/index.ts';
import { plain } from '#src/utils/style.ts';
import { watchCheck } from '#src/watch/index.ts';

import { outsideProject, page, project, write } from './watch-project.ts';
import { joined, seen } from './watch-session.ts';

type FakeChokidar = EventEmitter & { closed: boolean };

/** The chokidar watchers that the code under test made, in order. */
const made: FakeChokidar[] = [];

/** What the first watcher and each later one do. By default a watcher only sends `ready`. */
const script: {
  first?: (watcher: FakeChokidar) => void;
  batch?: (watcher: FakeChokidar) => void;
  /** Makes `watch()` throw for each watcher after the first. */
  failBatch?: Error;
} = {};

vi.mock('chokidar', () => ({
  watch: (): FakeChokidar => {
    if (made.length > 0 && script.failBatch !== undefined) {
      throw script.failBatch;
    }
    // eslint-disable-next-line unicorn/prefer-event-target -- a chokidar watcher is an EventEmitter
    const watcher: FakeChokidar = Object.assign(new EventEmitter(), {
      closed: false,
      close: async (): Promise<void> => {
        watcher.closed = true;
        await Promise.resolve();
      },
    });
    made.push(watcher);
    const act = made.length === 1 ? script.first : script.batch;
    process.nextTick(() => {
      if (act === undefined) {
        watcher.emit('ready');
      } else {
        act(watcher);
      }
    });
    return watcher;
  },
}));

afterEach(() => {
  made.length = 0;
  script.first = undefined;
  script.batch = undefined;
  script.failBatch = undefined;
});

interface Watch {
  out: string[];
  err: string[];
  /** Stdout and stderr together, in order, as a terminal shows them. */
  all: string[];
  stop: () => Promise<number>;
}

/** `check --watch` on the root, with the real `startWatcher` and the fake chokidar. */
function startWatch(root: string, tty = false, format: 'text' | 'json' = 'text'): Watch {
  const out: string[] = [];
  const err: string[] = [];
  const all: string[] = [];
  const abort = new AbortController();
  const done = watchCheck({
    rootDir: root,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
    prepare: false,
    render: result => formatResult(result, format, root, plain),
    human: format === 'text',
    tty,
    write: text => {
      out.push(text);
      all.push(text);
    },
    warn: text => {
      err.push(text);
      all.push(text);
    },
    signal: abort.signal,
    delayMs: 5,
  });
  return {
    out,
    err,
    all,
    stop: async () => {
      abort.abort();
      const code = await done;
      return code;
    },
  };
}

const EMFILE = 'EMFILE: too many open files';
const CLEAR = '\u001B[2J';
const EACCES = 'EACCES: permission denied';
const warning = (reason: string): string =>
  `layerscope: The file watcher reported an error: ${reason}. The watch goes on.\n`;
const count = (lines: string[], text: string): number => joined(lines).split(text).length - 1;

describe('an error from the file watcher', () => {
  it('after the first scan: warns once for each text, and the watch goes on', async () => {
    const root = project();
    const session = startWatch(root);
    await seen(session.out, '0 findings');
    const watcher = made.at(0);
    // With no `error` listener, the second error would throw.
    watcher?.emit('error', new Error(EMFILE));
    watcher?.emit('error', new Error(EMFILE));
    watcher?.emit('error', new Error(EACCES));
    expect(count(session.err, warning(EMFILE))).toBe(1);
    expect(count(session.err, warning(EACCES))).toBe(1);
    watcher?.emit('change', join(root, 'layers/a/app/helper.ts'));
    await seen(session.out, 'no change');
    expect(await session.stop()).toBe(0);
  });

  it('before the first scan of the root: warns once, and the watch starts', async () => {
    script.first = (watcher): void => {
      watcher.emit('error', new Error(EACCES));
      watcher.emit('ready');
    };
    const session = startWatch(project());
    await seen(session.out, '0 findings');
    expect(count(session.err, warning(EACCES))).toBe(1);
    expect(await session.stop()).toBe(0);
  });

  it('before the first scan of a batch: warns once, keeps the batch, and runs after the scan', async () => {
    const { root, outside } = outsideProject();
    // The file is saved just before the scan ends, later than the trigger delay, and no event comes
    // for it. Only a run after the scan sees it.
    script.batch = (watcher): void => {
      watcher.emit('error', new Error(EACCES));
      setTimeout(() => {
        write(outside, 'app/pages/bad.vue', page('./missing'));
        watcher.emit('ready');
      }, 100);
    };
    const session = startWatch(root);
    await seen(session.out, '+1 new  -0 fixed');
    expect(count(session.err, warning(EACCES))).toBe(1);
    expect(joined(session.err)).not.toContain('Cannot watch');
    expect(made[1]?.closed).toBe(false);
    expect(await session.stop()).toBe(0);
    expect(made.every(watcher => watcher.closed)).toBe(true);
  });
});

describe('an error from the file watcher on a terminal', () => {
  it('is still on the screen after the report clears it', async () => {
    script.first = (watcher): void => {
      watcher.emit('error', new Error(EACCES));
      watcher.emit('ready');
    };
    const session = startWatch(project(), true);
    await seen(session.out, '0 findings');
    const screen = joined(session.all);
    const lastClear = screen.lastIndexOf('\u001B[2J');
    expect(lastClear).toBeGreaterThan(-1);
    expect(screen.slice(lastClear)).toContain(warning(EACCES));
    expect(await session.stop()).toBe(0);
  });
});

/** Saves a page with a good and then a bad import, so that each save gives a full report. */
async function threeReports(root: string, session: Watch): Promise<void> {
  for (const [index, from] of ['./missing', '../helper', './missing'].entries()) {
    write(root, 'layers/a/app/pages/bad.vue', page(from));
    made.at(0)?.emit('change', join(root, 'layers/a/app/pages/bad.vue'));
    // eslint-disable-next-line no-await-in-loop -- one report after the other
    await vi.waitFor(() => {
      expect(count(session.out, CLEAR)).toBe(index + 2);
    });
  }
}

describe('many errors from the file watcher on a terminal', () => {
  it('shows the first 5 texts and one line for the rest, live and after each report', async () => {
    const root = project();
    const session = startWatch(root, true);
    await seen(session.out, '0 findings');
    for (let index = 0; index < 2000; index += 1) {
      made.at(0)?.emit('error', new Error(`EACCES: permission denied, scandir '/d${index}'`));
    }
    // 5 texts and the line about more. A note of the report can also be on stderr.
    expect(session.err.filter(line => line.includes('The file watcher'))).toHaveLength(6);
    expect(joined(session.err)).toContain(
      'layerscope: The file watcher reported more errors. They are not shown, and the watch goes on.\n',
    );
    await threeReports(root, session);
    for (const screen of joined(session.out).split(CLEAR).slice(-3)) {
      expect(count([screen], 'layerscope: The file watcher reported an error')).toBe(5);
      expect(screen).toContain(
        'layerscope: The file watcher reported 1995 more errors. They are not shown.\n',
      );
    }
    expect(await session.stop()).toBe(0);
  });

  it('writes the warning to stderr once: stderr is not the cleared screen', async () => {
    script.first = (watcher): void => {
      watcher.emit('error', new Error(EACCES));
      watcher.emit('ready');
    };
    const root = project();
    const session = startWatch(root, true);
    await seen(session.out, '0 findings');
    await threeReports(root, session);
    expect(count(session.err, warning(EACCES))).toBe(1);
    expect(count(session.out, warning(EACCES))).toBe(4);
    expect(await session.stop()).toBe(0);
  });
});

describe('a batch that cannot start, on a terminal', () => {
  it('is always shown, also after 5 other errors', async () => {
    const { root, outside } = outsideProject();
    script.first = (watcher): void => {
      for (let index = 0; index < 5; index += 1) {
        watcher.emit('error', new Error(`EACCES: permission denied, scandir '/d${index}'`));
      }
      watcher.emit('ready');
    };
    script.failBatch = new Error(EMFILE);
    const session = startWatch(root, true);
    const failure = `layerscope: Cannot watch ${outside}: ${EMFILE}. Changes in these dirs are not seen until the watch starts again.\n`;
    await seen(session.err, failure);
    expect(joined(session.err)).not.toContain('reported more errors');
    await threeReports(root, session);
    for (const screen of joined(session.out).split(CLEAR).slice(-3)) {
      expect(screen).toContain(failure);
    }
    expect(await session.stop()).toBe(0);
  });
});

describe('an error from the file watcher without a terminal', () => {
  it.each([
    ['text, not a terminal', false, 'text'],
    ['json on a terminal', true, 'json'],
  ] as const)('is not written to stdout again (%s)', async (_name, tty, format) => {
    script.first = (watcher): void => {
      watcher.emit('error', new Error(EACCES));
      watcher.emit('ready');
    };
    const root = project();
    const session = startWatch(root, tty, format);
    await seen(session.out, format === 'json' ? '"findings"' : '0 findings');
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    made.at(0)?.emit('change', join(root, 'layers/a/app/pages/bad.vue'));
    await seen(session.out, 'missing');
    expect(joined(session.out)).not.toContain('The file watcher reported');
    expect(count(session.err, warning(EACCES))).toBe(1);
    expect(await session.stop()).toBe(0);
  });
});
