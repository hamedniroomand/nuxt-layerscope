import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vite-plus/test';

import { LayerscopeError } from '#src/errors.ts';
import {
  loadSymbolTable,
  parseComponentExports,
  parseComponentInterface,
} from '#src/nuxt/symbols.ts';
import { tableFromRegistry } from '#src/registry/read.ts';
import type { ComponentMode, RegistryComponent } from '#src/registry/schema.ts';
import { makeRegistry } from '#test/factories.ts';
import { NUXT3_ROOT, NUXT4_ROOT, SNAPSHOTS_DIR } from '#test/fixtures.ts';

describe.each([
  ['nuxt 3', NUXT3_ROOT, 'base/components/UiCard.vue', 'UiCard'],
  ['nuxt 4', NUXT4_ROOT, 'layers/shared/app/components/BaseButton.vue', 'BaseButton'],
])('loadSymbolTable (%s)', (_label, root, componentFile, component) => {
  const table = loadSymbolTable(join(root, '.nuxt'));

  it('maps components, including Lazy variants, to their files', () => {
    const file = join(root, componentFile);
    expect(table.components.get(component)?.map(target => target.file)).toEqual([file]);
    expect(table.components.get(`Lazy${component}`)?.map(target => target.file)).toEqual([file]);
  });

  it('keeps framework symbols as external modules', () => {
    expect(table.imports.app.get('ref')).toEqual({ file: null, module: 'vue' });
    expect(table.imports.app.get('navigateTo')).toMatchObject({ module: 'nuxt' });
  });

  it('reads Nitro auto-imports separately', () => {
    expect(table.imports.server.has('defineEventHandler')).toBe(true);
    expect(table.imports.app.has('defineEventHandler')).toBe(false);
  });
});

describe('loadSymbolTable without generated files', () => {
  it('asks for nuxi prepare', () => {
    expect(() => loadSymbolTable('/nonexistent/.nuxt')).toThrow(LayerscopeError);
  });
});

describe.each([
  ['.nuxt/components.d.ts', 'root', 'components.d.ts', parseComponentExports],
  ['.nuxt/types/components.d.ts', 'types', 'types/components.d.ts', parseComponentInterface],
])('component declarations in %s', (_label, dir, file, parse) => {
  const buildDir = join(SNAPSHOTS_DIR, dir);
  const table = parse(join(buildDir, file), buildDir);
  const button = join(SNAPSHOTS_DIR, 'layers/shared/app/components/BaseButton.vue');

  it('maps components and Lazy variants to their files', () => {
    expect([...table.keys()]).toEqual(['BaseButton', 'NuxtLink', 'LazyBaseButton']);
    expect(table.get('BaseButton')).toEqual([{ file: button, module: null }]);
    expect(table.get('LazyBaseButton')).toEqual([{ file: button, module: null }]);
  });

  it('keeps the package of components under node_modules', () => {
    expect(table.get('NuxtLink')).toEqual([{ file: null, module: 'nuxt' }]);
  });
});

describe('tableFromRegistry', () => {
  it('keeps each file of a component name in the order of the registry, and the same file once', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-table-')));
    onTestFinished(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const client = join(dir, 'Pair.client.vue');
    const server = join(dir, 'Pair.server.vue');
    writeFileSync(client, '');
    writeFileSync(server, '');
    const entry = (file: string, mode: ComponentMode): RegistryComponent => ({
      name: 'Pair',
      file,
      mode,
      island: false,
      global: false,
      priority: 1,
    });
    const registry = makeRegistry();
    registry.components = [
      entry(client, 'client'),
      entry(server, 'server'),
      entry(client, 'client'),
    ];
    const table = tableFromRegistry(registry, join(dir, '.nuxt'));
    const files = [
      { file: client, module: null },
      { file: server, module: null },
    ];
    expect(table.components.get('Pair')).toEqual(files);
    expect(table.components.get('LazyPair')).toEqual(files);
  });
});
