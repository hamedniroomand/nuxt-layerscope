import { unlinkSync, writeFileSync } from 'node:fs';

import { basename, dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { formatResult } from '#src/report/index.ts';
import { plain } from '#src/utils/style.ts';
import { watchCheck } from '#src/watch/index.ts';

import { page, project, tempDir, write } from './watch-project.ts';
import { joined, noop, seen, start } from './watch-session.ts';

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
    expect(session.starts).toHaveLength(1);
    write(
      root,
      'layerscope.config.ts',
      `export default { layers: { a: { path: 'layers/a' }, ext: { path: '../${basename(outside)}' } } };\n`,
    );
    session.change({ config: true });
    await vi.waitFor(
      () => {
        expect(session.starts.slice(1), joined(session.err)).toEqual([[outside]]);
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
    expect(session.starts[0]).toEqual([root, configFile]);
    await session.stop();
  });
});

describe('watchCheck and the baseline key of the config', () => {
  it('prints the report again when the config names another baseline file with the same entries', async () => {
    const root = project();
    write(root, 'layers/a/app/pages/bad.vue', page('./missing'));
    const found = await analyze({ rootDir: root });
    for (const name of ['one.json', 'two.json']) {
      writeBaseline(join(root, name), createBaseline(found.findings, root));
    }
    const config = (name: string): string =>
      `export default { baseline: '${name}', layers: { a: { path: 'layers/a' } } };\n`;
    write(root, 'layerscope.config.mjs', config('one.json'));
    const session = start(root, 'json', false, { baseline: undefined });
    await vi.waitFor(() => {
      expect(session.out.length).toBe(1);
    });
    write(root, 'layerscope.config.mjs', config('two.json'));
    session.change({ config: true });
    await vi.waitFor(() => {
      expect(session.out.length).toBe(2);
    });
    await session.stop();
    expect(session.out[0]).toContain('one.json');
    expect(session.out[1]).toContain('two.json');
  });
});
