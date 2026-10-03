import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { graphView } from '#src/devtools/graph-api.ts';
import { MISSING_CLIENT, publicPaths, writeSnapshot } from '#src/devtools/static.ts';
import { traceView } from '#src/devtools/views-api.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

let publicDir = '';
let written: string[] = [];

let assetsDir = '';

beforeAll(async () => {
  publicDir = mkdtempSync(join(tmpdir(), 'layerscope-static-'));
  // Stands in for dist/devtools, which CI builds only after the tests.
  assetsDir = mkdtempSync(join(tmpdir(), 'layerscope-client-'));
  for (const name of ['client.js', 'client.css', 'graph-a1b2.js']) {
    writeFileSync(join(assetsDir, name), `/* ${name} */\n`);
  }
  written = await writeSnapshot({
    rootDir: NUXT4_ROOT,
    publicDir,
    base: '/__layerscope',
    assetsDir,
  });
}, 60_000);

afterAll(() => {
  rmSync(publicDir, { recursive: true, force: true });
  rmSync(assetsDir, { recursive: true, force: true });
});

const out = (path: string): string => join(publicDir, '__layerscope', path);
const readJson = (path: string): unknown => JSON.parse(readFileSync(out(path), 'utf8'));
const files = (): string[] =>
  readdirSync(out(''), { recursive: true, encoding: 'utf8' }).toSorted();

describe('static snapshot files', () => {
  it('writes the shell in demo mode, the client and one file per answer', () => {
    const all = files();
    for (const path of [
      'index.html',
      'assets/client.js',
      'assets/client.css',
      'report.json',
      'api/state.json',
      'api/report.json',
      'api/symbols.json',
      'api/unused.json',
      'api/baseline.json',
      'api/graph.json',
      'api/trace/useCart.json',
      'api/edge/admin/web.json',
      'api/node/admin.json',
    ]) {
      expect(all, path).toContain(path);
    }
    expect(all).toContain('assets/graph-a1b2.js');
    expect(written).toContain('api/graph.json');
    const shell = readFileSync(out('index.html'), 'utf8');
    expect(shell).toContain('"demo":true');
    expect(shell).toContain('src="/__layerscope/assets/client.js');
  });

  it('writes the same bodies as the live routes, with public paths', async () => {
    // The fixture has no baseline file, so the result is the same with or without one.
    const result = await analyze({ rootDir: NUXT4_ROOT });
    const same = (value: unknown): unknown =>
      JSON.parse(JSON.stringify(publicPaths(value, NUXT4_ROOT))) as unknown;
    expect(readJson('api/graph.json')).toEqual(same(await graphView(result, true)));
    expect(readJson('api/trace/useCart.json')).toEqual(same(await traceView(result, 'useCart')));
    const node = readJson('api/node/admin.json') as { files: unknown[]; total: number };
    expect(node.files).toHaveLength(node.total);
  });
});

describe('static snapshot privacy', () => {
  it('leaves no path of the build machine in any JSON file', () => {
    const machine = [NUXT4_ROOT, homedir(), tmpdir(), '/Users/', '/home/'];
    const leaks: string[] = [];
    for (const path of files().filter(name => name.endsWith('.json'))) {
      const text = readFileSync(out(path), 'utf8');
      for (const prefix of machine) {
        if (text.includes(prefix) || /[A-Z]:\\\\/u.test(text)) {
          leaks.push(`${path}: ${prefix}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('fails with a clear error when the client is not built', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'layerscope-noclient-'));
    try {
      await expect(
        writeSnapshot({ rootDir: NUXT4_ROOT, publicDir: empty, base: '/x', assetsDir: empty }),
      ).rejects.toThrow(MISSING_CLIENT);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
