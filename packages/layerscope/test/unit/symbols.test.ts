import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { LayerscopeError } from '#src/errors.ts';
import {
  loadSymbolTable,
  parseComponentExports,
  parseComponentInterface,
} from '#src/nuxt/symbols.ts';
import { NUXT3_ROOT, NUXT4_ROOT, SNAPSHOTS_DIR } from '#test/fixtures.ts';

describe.each([
  ['nuxt 3', NUXT3_ROOT, 'base/components/UiCard.vue', 'UiCard'],
  ['nuxt 4', NUXT4_ROOT, 'layers/shared/app/components/BaseButton.vue', 'BaseButton'],
])('loadSymbolTable (%s)', (_label, root, componentFile, component) => {
  const table = loadSymbolTable(join(root, '.nuxt'));

  it('maps components, including Lazy variants, to their files', () => {
    const file = join(root, componentFile);
    expect(table.components.get(component)?.file).toBe(file);
    expect(table.components.get(`Lazy${component}`)?.file).toBe(file);
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
    expect(table.get('BaseButton')).toEqual({ file: button, module: null });
    expect(table.get('LazyBaseButton')).toEqual({ file: button, module: null });
  });

  it('keeps the package of components under node_modules', () => {
    expect(table.get('NuxtLink')).toEqual({ file: null, module: 'nuxt' });
  });
});
