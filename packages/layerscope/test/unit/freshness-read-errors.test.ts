import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { assertFresh, assertRegistryFresh } from '#src/analyze/freshness.ts';
import { isScanDirThere, isTargetThere } from '#src/analyze/stale-check-fs.ts';
import { resolveLayers } from '#src/nuxt/layers.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { Registry } from '#src/registry/schema.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import { noNuxtIgnore } from '#test/factories.ts';

const CANNOT_DENY = process.platform === 'win32' || process.getuid?.() === 0;

function emptyTable(): SymbolTable {
  return {
    imports: { app: new Map(), server: new Map(), shared: new Map() },
    components: new Map(),
  };
}

function emptyRegistry(): Registry {
  return {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: [],
    components: [],
    shadowedComponents: [],
    shadowedLayouts: [],
    shadowedMiddleware: [],
    shadowedPages: [],
    componentDirs: [],
    importDirs: [],
    nuxtIgnore: noNuxtIgnore(),
    nuxtContent: false,
    imports: { app: [], server: [], shared: [] },
  };
}

/** Real path: macOS links /var to /private/var. */
function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-read-errors-')));
}

/** A table with one component in `dir`. */
function tableWith(dir: string): { table: SymbolTable; file: string } {
  const file = join(dir, 'Chart.vue');
  const table = emptyTable();
  table.components.set('Chart', [{ file, module: null }]);
  return { table, file };
}

describe('assertFresh with the types source and a components/ dir that cannot be read', () => {
  it.skipIf(CANNOT_DENY)('stops, and does not give --source types as a fix', async () => {
    const root = tempDir();
    const dir = join(root, 'layers/ui/app/components');
    mkdirSync(dir, { recursive: true });
    const layers = await resolveLayers(root, { layers: { ui: { path: 'layers/ui' } } });
    chmodSync(dir, 0o000);
    try {
      await expect(assertFresh(emptyTable(), layers)).rejects.toThrow(
        `Could not read ${dir} (EACCES), so layerscope cannot check it for new components. Fix the dir or its access.`,
      );
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

describe('a file that the generated types refer to', () => {
  it.skipIf(CANNOT_DENY).each(['types', 'registry'] as const)(
    'stops with the %s source when the file cannot be read',
    async source => {
      const parent = join(tempDir(), 'locked');
      mkdirSync(parent);
      const { table, file } = tableWith(parent);
      writeFileSync(file, '<template />');
      chmodSync(parent, 0o000);
      try {
        const check =
          source === 'types' ? assertFresh(table, []) : assertRegistryFresh(table, emptyRegistry());
        await expect(check).rejects.toThrow(
          `Generated types reference ${file}, which layerscope could not read (EACCES). Fix the file or its access.`,
        );
      } finally {
        chmodSync(parent, 0o700);
      }
    },
  );

  it('accepts a target that is a dir', async () => {
    const table = emptyTable();
    table.components.set('Chart', [{ file: tempDir(), module: null }]);
    await expect(assertRegistryFresh(table, emptyRegistry())).resolves.toBeUndefined();
  });

  it('is reported as deleted when its path has a file in it', async () => {
    const base = tempDir();
    writeFileSync(join(base, 'app'), 'not a dir');
    const { table, file } = tableWith(join(base, 'app'));
    await expect(assertRegistryFresh(table, emptyRegistry())).rejects.toThrow(
      `Generated types reference ${file}, which no longer exists.`,
    );
  });
});

describe('an error that is not about the path', () => {
  it('is thrown again as it is, not as "Could not read"', async () => {
    const bad = null as unknown as string;
    await expect(isScanDirThere(bad, 'new components')).rejects.toMatchObject({
      code: 'ERR_INVALID_ARG_TYPE',
    });
    expect(() => isTargetThere(bad)).toThrow(
      expect.objectContaining({ code: 'ERR_INVALID_ARG_TYPE' }),
    );
  });
});
