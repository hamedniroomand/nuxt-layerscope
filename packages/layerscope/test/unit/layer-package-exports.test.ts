import { existsSync, realpathSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { layerFromPath } from '#src/nuxt/layer-factory.ts';
import { layerPackageNames } from '#src/resolve/layer-package.ts';
import { resolveSpecifier } from '#src/resolve/specifier.ts';
import {
  KIT,
  LAYERS,
  UI_STORE,
  importsOf,
  outcomes,
  packagesOf,
  project,
} from '#test/layer-package-project.ts';

describe('an import by the package name of a layer with exports', () => {
  it('adds an extension to the path, as Vite does', async () => {
    const { root, rows } = await outcomes(['@acme/kit/lib/useLib']);
    expect(rows).toEqual([
      ['@acme/kit/lib/useLib', join(realpathSync(join(root, KIT)), 'lib/useLib.ts'), 'kit', null],
    ]);
  });

  it('uses the development target', async () => {
    const { root, rows } = await outcomes(['@acme/kit/dev']);
    expect(rows).toEqual([
      ['@acme/kit/dev', join(realpathSync(join(root, KIT)), 'src/index.ts'), 'kit', null],
    ]);
  });

  it('does not use the production target, as it reads the source', async () => {
    const { root, rows } = await outcomes(['@acme/kit/prod']);
    expect(rows).toEqual([
      ['@acme/kit/prod', join(realpathSync(join(root, KIT)), 'utils.ts'), 'kit', null],
    ]);
  });
});

describe('the types target of an import by the package name of a layer', () => {
  it('is used only for a statement with the type keyword', async () => {
    const files = {
      'import-type.ts': "import type { T } from '@acme/kit/types';\n",
      'export-type.ts': "export type { T } from '@acme/kit/types';\n",
      'export-type-all.ts': "export type * from '@acme/kit/types';\n",
      'import-type-equals.ts': "import type t = require('@acme/kit/types');\n",
      'inline-type.ts': "import { type T } from '@acme/kit/types';\n",
      'export-inline-type.ts': "export { type T } from '@acme/kit/types';\n",
      'value.ts': "import * as types from '@acme/kit/types';\n",
    };
    const root = project(
      Object.fromEntries(
        Object.entries(files).map(([name, code]) => [`layers/admin/app/utils/${name}`, code]),
      ),
    );
    const result = await analyze({ rootDir: root, config: { layers: LAYERS } });
    const types = join(realpathSync(join(root, KIT)), 'types.d.ts');
    const rows = Object.keys(files).map(name => {
      const file = join(root, 'layers/admin/app/utils', name);
      const edge = importsOf(result, file).at(0);
      const finding = result.findings.find(candidate => candidate.file === file);
      return [name, edge?.to ?? finding?.message];
    });
    const missing = 'Cannot resolve import "@acme/kit/types"';
    expect(rows).toEqual([
      ['import-type.ts', types],
      ['export-type.ts', types],
      ['export-type-all.ts', types],
      ['import-type-equals.ts', types],
      ['inline-type.ts', missing],
      ['export-inline-type.ts', missing],
      ['value.ts', missing],
    ]);
  });
});

describe('the package name of a layer', () => {
  it('does not take a Node builtin', () => {
    const root = project({ 'layers/events/package.json': JSON.stringify({ name: 'events' }) });
    const from = join(root, 'layers/admin/app/utils/use.ts');
    const packages = new Map([['events', { name: 'events', root: join(root, 'layers/events') }]]);
    expect(resolveSpecifier('events', from, [], join(root, '.nuxt'), packages)).toEqual({
      kind: 'external',
      module: 'events',
    });
  });

  it('matches in any case, as a file system that ignores case finds the package', () => {
    const root = project();
    const from = join(root, 'layers/admin/app/utils/use.ts');
    const resolution = resolveSpecifier(
      '@ACME/kit/x',
      from,
      [],
      join(root, '.nuxt'),
      packagesOf(root),
    );
    // On Linux the dir `@ACME` does not exist, so the import does not resolve.
    const ignoresCase = existsSync(join(root, 'node_modules/@ACME/kit'));
    expect(resolution).toEqual(
      ignoresCase
        ? { kind: 'file', file: join(realpathSync(join(root, KIT)), 'x.ts'), module: null }
        : { kind: 'missing' },
    );
  });
});

describe('layerPackageNames', () => {
  it('keeps each name in lower case, with the layer that comes first', () => {
    const root = project({
      'layers/one/package.json': JSON.stringify({ name: '@Acme/Kit' }),
      'layers/two/package.json': JSON.stringify({ name: '@acme/kit' }),
    });
    const layers = ['one', 'two'].map(name => layerFromPath(name, join(root, 'layers', name)));
    expect([...layerPackageNames(layers)]).toEqual([
      ['@acme/kit', { name: 'one', root: realpathSync(join(root, 'layers/one')) }],
    ]);
  });
});

describe('a package.json of a layer that changes after the resolver read it', () => {
  /** A bare import that only the lookup of `main` finds, so it reads the package.json again. */
  function resolveAfter(content: string): () => unknown {
    const root = project({
      [`${UI_STORE}/package.json`]: JSON.stringify({
        name: '@acme/ui-layer',
        main: './nuxt.config',
      }),
    });
    const from = join(root, 'layers/admin/app/utils/use.ts');
    const resolve = (): unknown =>
      resolveSpecifier('@acme/ui-layer', from, [], join(root, '.nuxt'), packagesOf(root));
    expect(resolve()).toMatchObject({ kind: 'file' });
    writeFileSync(join(root, UI_STORE, 'package.json'), content);
    return resolve;
  }

  it('stops the run with the file when it is not JSON', () => {
    const resolve = resolveAfter('{ "name": ');
    expect(resolve).toThrow(LayerscopeError);
    expect(resolve).toThrow(
      /^Cannot read the package\.json of layer "ui" \(.+\/package\.json\): /u,
    );
  });

  it('stops the run with the file when it is not a JSON object', () => {
    const resolve = resolveAfter('null');
    expect(resolve).toThrow(
      /^Cannot read the package\.json of layer "ui" \(.+\/package\.json\): the file does not contain a JSON object$/u,
    );
  });
});
