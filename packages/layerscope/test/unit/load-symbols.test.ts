import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { loadSymbols } from '#src/analyze/symbols.ts';
import { LayerscopeError } from '#src/errors.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

function tempBuildDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-symbols-')));
}

function writeRegistry(buildDir: string, version: unknown, layers?: unknown): void {
  mkdirSync(join(buildDir, 'layerscope'), { recursive: true });
  writeFileSync(join(buildDir, REGISTRY_FILE), `${JSON.stringify({ version, layers })}\n`);
}

/** A layer as older releases wrote it. */
const OLD_LAYER = {
  name: 'root',
  root: '/p',
  srcDir: '/p/app',
  serverDir: '/p/server',
  sharedDir: '/p/shared',
  defaultComponents: true,
};

describe('loadSymbols', () => {
  it('reads a compatible registry', () => {
    const symbols = loadSymbols(join(NUXT4_ROOT, '.nuxt'), 'registry');
    expect(symbols.source).toBe('registry');
    expect(symbols.registry).not.toBeNull();
    expect(symbols.notes).toEqual([]);
  });

  it('throws when the registry is required but missing', () => {
    expect(() => loadSymbols(tempBuildDir(), 'registry')).toThrow(LayerscopeError);
    expect(() => loadSymbols(tempBuildDir(), 'registry')).toThrow(/not found/u);
  });

  it('throws when the registry schema is incompatible and required', () => {
    const buildDir = tempBuildDir();
    writeRegistry(buildDir, 99);
    expect(() => loadSymbols(buildDir, 'registry')).toThrow(/schema version 99/u);
  });

  it('falls back to .d.ts with a note when the registry schema is incompatible', () => {
    const buildDir = tempBuildDir();
    const nuxt = join(NUXT4_ROOT, '.nuxt');
    symlinkSync(join(nuxt, 'types'), join(buildDir, 'types'));
    symlinkSync(join(nuxt, 'components.d.ts'), join(buildDir, 'components.d.ts'));
    writeRegistry(buildDir, 99);
    const symbols = loadSymbols(buildDir, 'auto');
    expect(symbols.source).toBe('types');
    expect(symbols.registry).toBeNull();
    expect(symbols.notes[0]).toMatch(/schema version 99.*Falling back/u);
  });
});

describe('loadSymbols with a registry from an older release', () => {
  it('throws when a layer of the registry has no modulesDir or publicDir and the registry is required', () => {
    const buildDir = tempBuildDir();
    writeRegistry(buildDir, 1, [OLD_LAYER]);
    expect(() => loadSymbols(buildDir, 'registry')).toThrow(
      `${join(buildDir, REGISTRY_FILE)} was written by an older nuxt-layerscope and has no modules or public dir for its layers. Run "nuxi prepare" to write it again.`,
    );
  });

  it('falls back to .d.ts with a note when a layer of the registry has no modulesDir', () => {
    const buildDir = tempBuildDir();
    const nuxt = join(NUXT4_ROOT, '.nuxt');
    symlinkSync(join(nuxt, 'types'), join(buildDir, 'types'));
    symlinkSync(join(nuxt, 'components.d.ts'), join(buildDir, 'components.d.ts'));
    writeRegistry(buildDir, 1, [{ ...OLD_LAYER, publicDir: '/p/public' }]);
    const symbols = loadSymbols(buildDir, 'auto');
    expect(symbols.source).toBe('types');
    expect(symbols.registry).toBeNull();
    expect(symbols.notes).toEqual([
      `${join(buildDir, REGISTRY_FILE)} was written by an older nuxt-layerscope and has no modules or public dir for its layers. Falling back to the generated .d.ts files. Run "nuxi prepare" to write it again.`,
    ]);
  });
});
