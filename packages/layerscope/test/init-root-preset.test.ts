import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, run } from '#src/cli.ts';
import { propose } from '#src/init/index.ts';
import { fittingPreset } from '#src/init/preset.ts';
import type { AllowedEdge } from '#src/init/types.ts';

const edge = (from: string, to: string): AllowedEdge => ({ from, to, count: 1, example: 'x:1' });

describe('the preset that init suggests, with root as a base', () => {
  it('suggests root alone as the base when the features use only root, also with a core layer', () => {
    const edges = [edge('shop', 'root'), edge('admin', 'root')];
    expect(fittingPreset(edges, ['root', 'shop', 'admin', 'core'])).toEqual({
      name: 'features',
      base: ['root'],
      object: true,
    });
  });

  it('suggests root and core as the base when the features use both', () => {
    const edges = [
      edge('shop', 'root'),
      edge('admin', 'root'),
      edge('shop', 'core'),
      edge('admin', 'core'),
      edge('core', 'root'),
    ];
    expect(fittingPreset(edges, ['root', 'shop', 'admin', 'core'])).toEqual({
      name: 'features',
      base: ['root', 'core'],
      object: true,
    });
  });

  it('suggests no root base when root uses a feature layer', () => {
    const edges = [edge('shop', 'root'), edge('root', 'shop')];
    expect(fittingPreset(edges, ['root', 'shop', 'admin'])).toBeNull();
  });

  it('suggests the plain preset when it fits, because it is stricter', () => {
    const edges = [edge('shop', 'shared'), edge('admin', 'shared')];
    expect(fittingPreset(edges, ['root', 'admin', 'shop', 'shared'])).toEqual({
      name: 'layered',
      base: ['shared'],
    });
  });
});

/** The layers of the project, declared by path, so no Nuxt install is needed. */
const LAYERS =
  "export default { layers: { website: { path: 'layers/website' }, admin: { path: 'layers/admin' } } };\n";

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** Shared code in root; two feature layers that use only root. Layers are declared by path. */
function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-init-root-')));
  write(root, 'app/composables/useShared.ts', 'export const useShared = () => 1;\n');
  write(
    root,
    '.nuxt/types/imports.d.ts',
    [
      'export {}',
      'declare global {',
      "  const useShared: typeof import('../../app/composables/useShared').useShared",
      '}',
      '',
    ].join('\n'),
  );
  write(root, '.nuxt/components.d.ts', '\n');
  for (const name of ['website', 'admin']) {
    write(
      root,
      `layers/${name}/app/pages/index.vue`,
      '<script setup lang="ts">\nuseShared();\n</script>\n',
    );
  }
  write(root, 'layerscope.config.mjs', LAYERS);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('init on root with two features that use only root', () => {
  it('suggests the root base, and that preset gives no error in check', async () => {
    const root = project();
    const proposal = propose(await analyze({ rootDir: root }));
    expect(proposal.preset).toEqual({ name: 'features', base: ['root'], object: true });
    write(
      root,
      'layerscope.config.mjs',
      "export default { preset: { name: 'features', base: ['root'] }, layers: { website: { path: 'layers/website' }, admin: { path: 'layers/admin' } } };\n",
    );
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await run(['node', 'layerscope', 'check', root])).toBe(EXIT_CLEAN);
  });
});
