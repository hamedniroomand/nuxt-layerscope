import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { assertFresh } from '#src/analyze/freshness.ts';
import { LayerscopeError } from '#src/errors.ts';
import { resolveLayers } from '#src/nuxt/layers.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

function tempProject(): string {
  // Real path: layers are compared as real paths, and macOS links /var to /private/var.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-')));
  mkdirSync(join(root, 'layers/ui/app/components'), { recursive: true });
  return root;
}

function emptyTable(): SymbolTable {
  return {
    imports: { app: new Map(), server: new Map(), shared: new Map() },
    components: new Map(),
  };
}

describe('resolveLayers without @nuxt/kit', () => {
  it('builds layers from config paths and adds the root', async () => {
    const root = tempProject();
    const layers = await resolveLayers(root, { layers: { ui: { path: 'layers/ui' } } });
    expect(layers.map(layer => [layer.name, layer.srcDir])).toEqual([
      ['root', root],
      ['ui', join(root, 'layers/ui/app')],
    ]);
  });

  it('asks for paths when there is nothing to go on', async () => {
    await expect(resolveLayers(tempProject(), {})).rejects.toThrow(/give every layer a "path"/u);
  });
});

describe('resolveLayers validation', () => {
  it('rejects unknown layers in config', async () => {
    await expect(resolveLayers(NUXT4_ROOT, { layers: { nope: {} } })).rejects.toThrow(
      /Unknown layer "nope"/u,
    );
  });

  it('rejects unknown layers in allow lists', async () => {
    await expect(
      resolveLayers(NUXT4_ROOT, { layers: { web: { allow: ['nope'] } } }),
    ).rejects.toThrow(/unknown layer "nope"/u);
  });
});

describe('createOwnerLookup', () => {
  it('picks the deepest layer and skips node_modules', async () => {
    const root = tempProject();
    const layers = await resolveLayers(root, { layers: { ui: { path: 'layers/ui' } } });
    const ownerOf = createOwnerLookup(layers);
    expect(ownerOf(join(root, 'layers/ui/app/a.ts'))?.name).toBe('ui');
    expect(ownerOf(join(root, 'app/a.ts'))?.name).toBe('root');
    expect(ownerOf(join(root, 'node_modules/x/a.ts'))).toBeNull();
  });
});

describe('assertFresh', () => {
  it('fails on components missing from generated types', async () => {
    const root = tempProject();
    writeFileSync(join(root, 'layers/ui/app/components/New.vue'), '<template />');
    const layers = await resolveLayers(root, { layers: { ui: { path: 'layers/ui' } } });
    await expect(assertFresh(emptyTable(), layers)).rejects.toThrow(LayerscopeError);
  });

  it('fails on generated types pointing at deleted files', async () => {
    const table = emptyTable();
    table.components.set('Gone', { file: '/nonexistent/Gone.vue', module: null });
    await expect(assertFresh(table, [])).rejects.toThrow(/no longer exists/u);
  });
});
