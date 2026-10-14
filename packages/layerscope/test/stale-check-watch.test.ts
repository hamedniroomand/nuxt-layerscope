import { readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { formatResult } from '#src/report/index.ts';
import { plain } from '#src/utils/style.ts';
import { watchCheck } from '#src/watch/index.ts';

import { prepareFixture, privateFixture } from './private-fixture.ts';

/** A private copy of the fixture, so that no other test sees the file that this test adds. */
let copy = '';

beforeAll(() => {
  copy = privateFixture();
}, 120_000);

afterAll(() => {
  rmSync(copy, { recursive: true, force: true });
});

const WAIT = { timeout: 30_000, interval: 50 };

/**
 * Waits for `check`. When it still fails after 3 s, `poke` makes the change again, and again
 * every 3 s: a busy machine can drop a file event, and then the watch does not run by itself.
 */
async function waitPoking(poke: () => void, check: () => void): Promise<void> {
  let poked = Date.now();
  await vi.waitFor(() => {
    if (Date.now() - poked > 3000) {
      poke();
      poked = Date.now();
    }
    check();
  }, WAIT);
}

interface Watch {
  out: string[];
  err: string[];
  stop: () => Promise<number>;
}

/** `check --watch` with the real file watcher, in text format. */
function startWatch(): Watch {
  const out: string[] = [];
  const err: string[] = [];
  const abort = new AbortController();
  const done = watchCheck({
    rootDir: copy,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
    prepare: false,
    render: result => formatResult(result, 'text', copy, plain),
    human: true,
    tty: false,
    write: text => {
      out.push(text);
    },
    warn: text => {
      err.push(text);
    },
    signal: abort.signal,
    delayMs: 50,
  });
  return {
    out,
    err,
    stop: async () => {
      abort.abort();
      const code = await done;
      return code;
    },
  };
}

/** Writes a composable that the registry does not list, and waits for the stale error. */
async function addStale(err: string[], name: string): Promise<string> {
  const file = join(copy, 'layers/web/app/composables', `${name}.ts`);
  const write = (): void => {
    writeFileSync(file, `export function ${name}() {\n  return 1;\n}\n`);
  };
  write();
  await waitPoking(write, () => {
    expect(err.join(''), 'the stale error after the new file').toContain(
      `layers/web/app/composables/${name}.ts is missing from the layerscope registry`,
    );
  });
  return file;
}

describe('check --watch on a cached environment (#153)', () => {
  it('stops with the stale error after a new auto-import file, and runs clean after nuxi prepare', async () => {
    const { out, err, stop } = startWatch();
    try {
      await vi.waitFor(() => {
        expect(out.join(''), 'the first run').toContain('watching');
      }, WAIT);
      // `shared` exports `useFormat`; the new file in `web` overrides it for the layers above it.
      await addStale(err, 'useFormat');
      const shown = out.length;
      prepareFixture(copy);
      // The watch sees the new registry and runs again by itself, with no restart.
      const registry = join(copy, '.nuxt/layerscope/registry.json');
      const written = readFileSync(registry);
      await waitPoking(
        () => {
          writeFileSync(registry, written);
        },
        () => {
          expect(out.slice(shown).join(''), 'a clean run after nuxi prepare').toContain('watching');
        },
      );
    } finally {
      expect(await stop()).toBe(0);
    }
  }, 120_000);

  it('prints the whole report again when the run after the stale error has the same result', async () => {
    const { out, err, stop } = startWatch();
    try {
      await vi.waitFor(() => {
        expect(out.join(''), 'the first run').toContain('watching');
      }, WAIT);
      const file = await addStale(err, 'useWebExtra');
      const shown = out.length;
      unlinkSync(file);
      // The result is the same as before the error. A status line with "no change" only would
      // leave the error on the screen as the last output.
      await vi.waitFor(() => {
        expect(out.slice(shown).join(''), 'the report after the file is gone').toContain('--- ');
      }, WAIT);
      expect(out.slice(shown).join('')).not.toContain('no change');
    } finally {
      expect(await stop()).toBe(0);
    }
  }, 120_000);
});
