import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { assertFresh, assertRegistryFresh } from '#src/analyze/freshness.ts';
import { resolveLayers } from '#src/nuxt/layers.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { Registry, RegistryComponentDir } from '#src/registry/schema.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import type { Layer } from '#src/types.ts';
import { noNuxtIgnore } from '#test/factories.ts';

function emptyTable(): SymbolTable {
  return {
    imports: { app: new Map(), server: new Map(), shared: new Map() },
    components: new Map(),
  };
}

function registryWith(componentDirs: RegistryComponentDir[]): Registry {
  return {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: [],
    components: [],
    shadowedComponents: [],
    shadowedLayouts: [],
    shadowedMiddleware: [],
    componentDirs,
    importDirs: [],
    nuxtIgnore: noNuxtIgnore(),
    nuxtContent: false,
    imports: { app: [], server: [], shared: [] },
  };
}

/** Real path: layers are compared as real paths, and macOS links /var to /private/var. */
function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-fresh-')));
}

/** A custom component dir, which the `.d.ts` fallback does not know about. */
function widgetsDir(): string {
  const dir = join(tempDir(), 'widgets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Chart.vue'), '<template />');
  return dir;
}

describe('assertRegistryFresh', () => {
  it('passes when every scanned dir holds the recorded files', async () => {
    const dir = widgetsDir();
    const registry = registryWith([
      { path: dir, pattern: '**/*.vue', ignore: [], files: [join(dir, 'Chart.vue')] },
    ]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });

  it('fails on a component added to a custom dir after prepare', async () => {
    const dir = widgetsDir();
    const registry = registryWith([{ path: dir, pattern: '**/*.vue', ignore: [], files: [] }]);
    await expect(assertRegistryFresh(emptyTable(), registry)).rejects.toThrow(
      /Chart\.vue is missing from the layerscope registry/u,
    );
  });

  it('honours the ignore patterns of the dir', async () => {
    const dir = widgetsDir();
    const registry = registryWith([
      { path: dir, pattern: '**/*.vue', ignore: ['**/Chart.vue'], files: [] },
    ]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });
});

/** A component dir that the registry records with no files. */
function emptyEntry(path: string): RegistryComponentDir {
  return { path, pattern: '**/*.vue', ignore: [], files: [] };
}

describe('assertRegistryFresh for component dirs that are gone', () => {
  it('passes when the dir is gone, or has a file in its path', async () => {
    const base = tempDir();
    writeFileSync(join(base, 'app'), 'not a dir');
    const registry = registryWith([
      emptyEntry(join(base, 'missing')),
      emptyEntry(join(base, 'app/components')),
    ]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });

  it('skips the node_modules dir itself, and a dir below it', async () => {
    const base = tempDir();
    const modules = join(base, 'node_modules');
    mkdirSync(join(modules, 'pkg'), { recursive: true });
    writeFileSync(join(modules, 'New.vue'), '<template />');
    writeFileSync(join(modules, 'pkg/New.vue'), '<template />');
    const registry = registryWith([emptyEntry(modules), emptyEntry(join(modules, 'pkg'))]);
    await expect(assertRegistryFresh(emptyTable(), registry)).resolves.toBeUndefined();
  });
});

describe('assertRegistryFresh for component dirs that cannot be read', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'does not read a dir without read access (stat passes) as an empty dir',
    async () => {
      const dir = widgetsDir();
      chmodSync(dir, 0o000);
      try {
        await expect(
          assertRegistryFresh(emptyTable(), registryWith([emptyEntry(dir)])),
        ).rejects.toThrow(
          `Could not read ${dir} (EACCES), so layerscope cannot check it for new components. Fix the dir or its access.`,
        );
      } finally {
        chmodSync(dir, 0o700);
      }
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'does not read a dir that it cannot reach as an empty dir',
    async () => {
      const parent = join(tempDir(), 'locked');
      const dir = join(parent, 'widgets');
      mkdirSync(dir, { recursive: true });
      chmodSync(parent, 0o000);
      try {
        await expect(
          assertRegistryFresh(emptyTable(), registryWith([emptyEntry(dir)])),
        ).rejects.toThrow(`Could not read ${dir} (EACCES)`);
      } finally {
        chmodSync(parent, 0o700);
      }
    },
  );
});

describe('assertFresh without the registry', () => {
  async function layersWith(files: string[]): Promise<Layer[]> {
    const root = tempDir();
    for (const file of files) {
      mkdirSync(join(root, 'layers/ui/app/components', file, '..'), { recursive: true });
      writeFileSync(join(root, 'layers/ui/app/components', file), '<template />');
    }
    const layers = await resolveLayers(root, { layers: { ui: { path: 'layers/ui' } } });
    return layers;
  }

  it('takes a file named like a registered component as overridden', async () => {
    // The winner lives in another layer; the name is all the `.d.ts` files tell.
    const table = emptyTable();
    table.components.set('BaseCard', [{ file: null, module: 'theme' }]);
    const layers = await layersWith(['BaseCard.vue']);
    await expect(assertFresh(table, layers)).resolves.toBeUndefined();
  });

  it('skips islands, which components.d.ts leaves out', async () => {
    const layers = await layersWith(['islands/Weather.vue', 'Map.island.vue']);
    await expect(assertFresh(emptyTable(), layers)).resolves.toBeUndefined();
  });
});
