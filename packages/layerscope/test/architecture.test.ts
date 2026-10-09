import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import type { LayerscopeConfig } from '#src/types.ts';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function page(...lines: string[]): string {
  return `<script setup lang="ts">\n${lines.join('\n')}\n</script>\n`;
}

function ring(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-arch-')));
  const names = ['a', 'b', 'c', 'shared'];
  for (const name of names) {
    write(
      root,
      `layers/${name}/app/composables/use${name}.ts`,
      `export const use${name} = () => 1;\n`,
    );
  }
  write(root, 'layers/a/app/pages/a.vue', page('useb();', 'useshared();'));
  write(root, 'layers/b/app/pages/b.vue', page('usec();'));
  write(root, 'layers/c/app/pages/c.vue', page('usea();'));
  const declared = names
    .map(
      name =>
        `  const use${name}: typeof import('../../layers/${name}/app/composables/use${name}').use${name}`,
    )
    .join('\n');
  write(root, '.nuxt/types/imports.d.ts', `export {}\ndeclare global {\n${declared}\n}\n`);
  write(root, '.nuxt/components.d.ts', '\n');
  return root;
}

function config(extra: LayerscopeConfig): LayerscopeConfig {
  const layers = Object.fromEntries(
    ['a', 'b', 'c', 'shared'].map(name => [name, { path: `layers/${name}` }]),
  );
  return { layers, ...extra };
}

async function messages(root: string, extra: LayerscopeConfig, rule: string): Promise<string[]> {
  const result = await analyze({ rootDir: root, config: config(extra) });
  return result.findings.filter(finding => finding.rule === rule).map(finding => finding.message);
}

function quiet(): () => string {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  return () => out.mock.calls.map(call => String(call[0])).join('');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('layer-cycle', () => {
  it('is off by default', async () => {
    expect(await messages(ring(), {}, 'layer-cycle')).toEqual([]);
  });

  it('reports the full chain of a cycle', async () => {
    const found = await messages(ring(), { rules: { 'layer-cycle': 'error' } }, 'layer-cycle');
    expect(found).toEqual(['Layers form a cycle: a → b → c → a']);
  });
});

describe('presets', () => {
  it('layered lets layers use only shared', async () => {
    const found = await messages(ring(), { preset: 'layered' }, 'layer-boundary');
    expect(found).toHaveLength(3);
    expect(found.join()).not.toContain('"shared"');
  });

  it('stacked lets a layer use only the layers below it', async () => {
    const found = await messages(ring(), { preset: 'stacked' }, 'layer-boundary');
    expect(found).toEqual(['Auto-import "usea" crosses from layer "c" into "a"']);
  });

  it('features picks shared as the base layer here, and a base option can name another', async () => {
    const found = await messages(ring(), { preset: 'features' }, 'layer-boundary');
    expect(found).toHaveLength(3);
    const own = await messages(
      ring(),
      { preset: { name: 'features', base: ['a'] } },
      'layer-boundary',
    );
    // Every layer may use `a`; `a` itself uses `b` and `shared`.
    expect(own.join()).toContain('into "b"');
    expect(own.join()).not.toContain('into "a"');
  });

  it('reports a base layer that is not a layer as a config error', async () => {
    const root = ring();
    const layers = config({}).layers;
    await expect(
      analyze({ rootDir: root, config: { layers, preset: { name: 'features', base: ['nope'] } } }),
    ).rejects.toThrow('preset "features": base layer "nope" is not a layer');
  });

  it('lets an explicit allow win over the preset', async () => {
    const layers = { c: { path: 'layers/c', allow: ['a'] } };
    const found = await messages(
      ring(),
      { preset: 'stacked', layers: { ...config({}).layers, ...layers } },
      'layer-boundary',
    );
    expect(found).toEqual([]);
  });
});

function repo(): string {
  const root = ring();
  write(
    root,
    'layerscope.config.mjs',
    `export default ${JSON.stringify(config({ preset: 'layered' }))};\n`,
  );
  write(
    root,
    'layerscope-baseline.json',
    JSON.stringify({
      version: 1,
      entries: [
        {
          rule: 'layer-boundary',
          file: 'layers/a/app/pages/a.vue',
          symbol: 'useb',
          toLayer: 'b',
        },
        {
          rule: 'layer-boundary',
          file: 'layers/a/app/pages/gone.vue',
          symbol: 'usec',
          toLayer: 'c',
        },
      ],
    }),
  );
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      encoding: 'utf8',
    });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return root;
}

describe('layerscope drift', () => {
  it('says how many violations were added and fixed against the base', async () => {
    const root = repo();
    const stdout = quiet();
    expect(await run(['node', 'layerscope', 'drift', root, '--base', 'HEAD'])).toBe(EXIT_CLEAN);
    expect(stdout()).toContain('adds 2, fixes 1 against HEAD');
    expect(stdout()).toContain('Baseline: 2 → 2 (±0)');
  });

  it('exits 2 on an unknown ref', async () => {
    const root = repo();
    quiet();
    expect(await run(['node', 'layerscope', 'drift', root, '--base', 'nope'])).toBe(EXIT_ERROR);
  });
});
