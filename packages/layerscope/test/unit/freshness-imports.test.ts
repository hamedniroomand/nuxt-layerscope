import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { assertRegistryFresh } from '#src/analyze/freshness.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { Registry, RegistryImportDir } from '#src/registry/schema.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';

const EXTENSIONS = '*.{mts,cts,ts,tsx,mjs,cjs,js,jsx}';

function emptyTable(): SymbolTable {
  return {
    imports: { app: new Map(), server: new Map(), shared: new Map() },
    components: new Map(),
  };
}

function registryWith(importDirs: RegistryImportDir[]): Registry {
  return {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: [],
    components: [],
    shadowedComponents: [],
    componentDirs: [],
    importDirs,
    imports: { app: [], server: [], shared: [] },
  } as Registry;
}

function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-imports-')));
}

/** The entry that the module records for a dir: the dir and the globs that Nuxt scans it with. */
function entry(dir: string, files: string[]): RegistryImportDir {
  return { dir, globs: [dir, join(dir, EXTENSIONS)], files };
}

function composables(files: string[]): string {
  const dir = join(tempDir(), 'layers/shop/app/composables');
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    writeFileSync(join(dir, file), 'export const x = 1;\n');
  }
  return dir;
}

describe('assertRegistryFresh for auto-import dirs', () => {
  it('passes when the dir holds the recorded files', async () => {
    const dir = composables(['useCart.ts']);
    const registry = registryWith([entry(dir, [join(dir, 'useCart.ts')])]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });

  it('fails on a composable added to a dir after prepare', async () => {
    const dir = composables(['useCart.ts', 'useNotice.ts']);
    const registry = registryWith([entry(dir, [join(dir, 'useCart.ts')])]);
    await expect(assertRegistryFresh(emptyTable(), registry)).rejects.toThrow(
      /useNotice\.ts is missing from the layerscope registry\. Run "nuxi prepare" again/u,
    );
  });

  it('fails on a composable in a dir that did not exist at prepare', async () => {
    const dir = join(tempDir(), 'layers/shop/app/composables');
    const registry = registryWith([entry(dir, [])]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'useNotice.ts'), 'export const x = 1;\n');
    await expect(assertRegistryFresh(emptyTable(), registry)).rejects.toThrow(
      /useNotice\.ts is missing from the layerscope registry/u,
    );
  });

  it('fails on a new file that Nuxt would ignore: one more prepare clears it', async () => {
    const dir = composables(['helper.d.ts']);
    const registry = registryWith([entry(dir, [])]);
    await expect(assertRegistryFresh(emptyTable(), registry)).rejects.toThrow(
      /helper\.d\.ts is missing from the layerscope registry/u,
    );
  });

  it('keeps a file of the raw scan that was there at prepare, ignored or not', async () => {
    const dir = composables(['useCart.ts', 'skipped.ts']);
    const registry = registryWith([entry(dir, [join(dir, 'skipped.ts'), join(dir, 'useCart.ts')])]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });
});

describe('assertRegistryFresh for auto-import dirs that are gone or cannot be read', () => {
  it('passes when the dir is gone, or has a file in its path', async () => {
    const base = tempDir();
    writeFileSync(join(base, 'app'), 'not a dir');
    const registry = registryWith([
      entry(join(base, 'missing'), []),
      entry(join(base, 'app/composables'), []),
    ]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });

  it('skips a dir of a dependency', async () => {
    const base = tempDir();
    const dir = join(base, 'node_modules/@x/layer/app/composables');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'useNew.ts'), 'export const x = 1;\n');
    const registry = registryWith([entry(dir, [])]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });
});

describe('assertRegistryFresh for auto-import dirs that are globs', () => {
  it('finds a new file that a glob dir matches, without a stat of the glob', async () => {
    const base = tempDir();
    const dir = join(base, 'composables');
    mkdirSync(join(dir, 'cart'), { recursive: true });
    writeFileSync(join(dir, 'cart/index.ts'), 'export const x = 1;\n');
    const glob = join(dir, '*/index.ts');
    const registry = registryWith([{ dir: glob, globs: [glob], files: [] }]);
    await expect(assertRegistryFresh(emptyTable(), registry)).rejects.toThrow(
      /cart\/index\.ts is missing from the layerscope registry/u,
    );
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'does not read a dir that it cannot open as an empty dir',
    async () => {
      const base = tempDir();
      const parent = join(base, 'locked');
      const dir = join(parent, 'composables');
      mkdirSync(dir, { recursive: true });
      chmodSync(parent, 0o000);
      try {
        const registry = registryWith([entry(dir, [])]);
        await expect(assertRegistryFresh(emptyTable(), registry)).rejects.toThrow(
          new RegExp(`${dir}.*EACCES`, 'u'),
        );
      } finally {
        chmodSync(parent, 0o700);
      }
    },
  );
});
