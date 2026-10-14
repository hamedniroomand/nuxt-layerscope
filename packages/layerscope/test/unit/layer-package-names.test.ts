import { realpathSync, writeFileSync } from 'node:fs';

import { join, relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { resolveSpecifier } from '#src/resolve/specifier.ts';
import type { Resolution } from '#src/resolve/specifier.ts';
import { findUnused } from '#src/unused/index.ts';
import {
  KIT,
  KIT_EXPORTS,
  LAYERS,
  UI_STORE,
  analyzeProject,
  importsOf,
  link,
  project,
  write,
} from '#test/layer-package-project.ts';

describe('an import by the package name of the project itself', () => {
  const self = 'acme-app/layers/admin/app/utils/other';
  const other = { 'layers/admin/app/utils/other.ts': 'export const other = 1;\n' };
  const config = { layers: { ...LAYERS, root: { path: '.' } } };

  async function selfImport(manifest: object): Promise<(string | null)[]> {
    const root = project({
      ...other,
      'package.json': JSON.stringify(manifest),
      'layers/admin/app/utils/use.ts': `import { other } from '${self}';\n`,
    });
    const result = await analyze({ rootDir: root, config });
    const file = join(root, 'layers/admin/app/utils/use.ts');
    const edge = importsOf(result, file).at(0);
    if (edge !== undefined) {
      return [edge.to === null ? null : relative(root, edge.to), edge.toLayer];
    }
    const finding = result.findings.find(candidate => candidate.file === file);
    return [finding?.rule ?? null, finding?.message ?? null];
  }

  it('is unresolved without exports, as Node does not resolve it', async () => {
    expect(await selfImport({ name: 'acme-app' })).toEqual([
      'unresolved-reference',
      `Cannot resolve import "${self}"`,
    ]);
  });

  it('resolves through the exports of the project', async () => {
    expect(await selfImport({ name: 'acme-app', exports: { './*': './*.ts' } })).toEqual([
      'layers/admin/app/utils/other.ts',
      'admin',
    ]);
  });
});

describe('resolveSpecifier for a layer package', () => {
  it('sees a file that is added after a failed lookup, with and without exports', () => {
    const root = project();
    const from = join(root, 'layers/admin/app/utils/use.ts');
    const layerPackages = new Map([
      ['@acme/ui-layer', 'ui'],
      ['@acme/kit', 'kit'],
    ]);
    for (const [specifier, dir] of [
      ['@acme/ui-layer/app/composables/useLate', UI_STORE],
      ['@acme/kit/app/composables/useLate', KIT],
    ]) {
      const resolve = (): Resolution =>
        resolveSpecifier(specifier, from, [], join(root, '.nuxt'), layerPackages);
      expect(resolve()).toEqual({ kind: 'missing' });
      const file = join(realpathSync(join(root, dir)), 'app/composables/useLate.ts');
      writeFileSync(file, 'export const useLate = () => 1;\n');
      expect(resolve()).toMatchObject({ kind: 'file', file });
    }
  });
});

/** The message of the JSON error for the half-written `package.json` of the tests. */
function parseError(): string {
  try {
    JSON.parse('{ "name": ');
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('the package name of a layer', () => {
  it('comes only from a name string in package.json: not a number, not a null file', async () => {
    const root = project({
      [`${KIT}/package.json`]: JSON.stringify({ name: 42, exports: KIT_EXPORTS }),
      [`${UI_STORE}/package.json`]: 'null',
      'layers/admin/app/utils/use.ts': "import { x } from '@acme/kit/x';\n",
    });
    write(
      root,
      'layers/admin/app/utils/ui.ts',
      "import { y } from '@acme/ui-layer/app/composables/useTheme';\n",
    );
    const result = await analyzeProject(root);
    const imports = result.edges.filter(edge => edge.kind === 'import');
    expect(imports.map(edge => [edge.symbol, edge.to, edge.external])).toEqual([
      ['@acme/ui-layer/app/composables/useTheme', null, '@acme/ui-layer'],
      ['@acme/kit/x', null, '@acme/kit'],
    ]);
  });

  it('stops the run with the file and the reason when package.json cannot be read', async () => {
    const root = project({ [`${KIT}/package.json`]: '{ "name": ' });
    const file = join(realpathSync(join(root, KIT)), 'package.json');
    const error = await analyzeProject(root).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LayerscopeError);
    const { message } = error as Error;
    // The reason is the message of the JSON error, with no period added.
    expect(message).toBe(`Cannot read the package.json of layer "kit" (${file}): ${parseError()}`);
  });
});

describe('unused', () => {
  it('counts an import by package name as a use', async () => {
    const root = project({
      'layers/web/package.json': JSON.stringify({ name: '@acme/web' }),
      'layers/web/app/composables/useWebUsed.ts': 'export const useWebUsed = () => 1;\n',
      'layers/web/app/composables/useWebUnused.ts': 'export const useWebUnused = () => 1;\n',
      'layers/admin/app/utils/use.ts':
        "import { useWebUsed } from '@acme/web/app/composables/useWebUsed';\nuseWebUsed();\n",
      '.nuxt/types/imports.d.ts': `export {}
declare global {
  const useTheme: typeof import('../../${UI_STORE}/app/composables/useTheme').useTheme
  const useKit: typeof import('../../${KIT}/app/composables/useKit').useKit
  const useWebUsed: typeof import('../../layers/web/app/composables/useWebUsed').useWebUsed
  const useWebUnused: typeof import('../../layers/web/app/composables/useWebUnused').useWebUnused
}
`,
    });
    link(root, 'layers/web', 'node_modules/@acme/web');
    const result = await analyze({
      rootDir: root,
      config: { layers: { ...LAYERS, web: { path: 'layers/web' } } },
    });
    expect(findUnused(result).map(symbol => symbol.name)).toEqual(['useWebUnused']);
  });
});
