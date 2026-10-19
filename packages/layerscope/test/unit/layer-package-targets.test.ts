import { chmodSync, realpathSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { failingManifest } from '#src/resolve/layer-package.ts';
import { resolveSpecifier } from '#src/resolve/specifier.ts';
import { KIT, UI_STORE, outcomes, packagesOf, project } from '#test/layer-package-project.ts';

const CANNOT_DENY = process.platform === 'win32' || process.getuid?.() === 0;

/** The files of layer `kit` with this package.json. `src/index.ts` is in the project already. */
const kitWith = (manifest: object): Record<string, string> => ({
  [`${KIT}/package.json`]: JSON.stringify({ name: '@acme/kit', ...manifest }),
  [`${KIT}/src/util.ts`]: 'export const util = 1;\n',
  [`${KIT}/src/secret.ts`]: 'export const secret = 1;\n',
});

/** The row of an import that resolves to `file` in layer `kit`. The path is the real one. */
const inKit = (root: string, specifier: string, file: string): (string | null)[] => [
  specifier,
  join(realpathSync(join(root, KIT)), file),
  'kit',
  null,
];

describe('the target of exports or main of a layer, looked up as Vite does', () => {
  it('adds an extension to an exports target', async () => {
    const { root, rows } = await outcomes(
      ['@acme/kit'],
      kitWith({ exports: { '.': './src/index' } }),
    );
    expect(rows).toEqual([inKit(root, '@acme/kit', 'src/index.ts')]);
  });

  it('maps a .js exports target to the .ts file, also through a pattern', async () => {
    const { root, rows } = await outcomes(
      ['@acme/kit', '@acme/kit/util'],
      kitWith({ exports: { '.': './src/index.js', './*': './src/*.js' } }),
    );
    expect(rows).toEqual([
      inKit(root, '@acme/kit', 'src/index.ts'),
      inKit(root, '@acme/kit/util', 'src/util.ts'),
    ]);
  });

  it.each(['./src/index', './src/index.js'])('finds the file of main %s', async main => {
    const { root, rows } = await outcomes(['@acme/kit'], kitWith({ main }));
    expect(rows).toEqual([inKit(root, '@acme/kit', 'src/index.ts')]);
  });

  it('does not resolve a path that exports sets to null, also when a file has its name', async () => {
    const { root, rows } = await outcomes(
      ['@acme/kit/secret', '@acme/kit/util'],
      kitWith({ exports: { './secret': null, './*': './src/*' } }),
    );
    expect(rows).toEqual([
      ['@acme/kit/secret', 'unresolved-reference', 'Cannot resolve import "@acme/kit/secret"'],
      inKit(root, '@acme/kit/util', 'src/util.ts'),
    ]);
  });

  it('does not use main when exports does not export the package root', async () => {
    const { rows } = await outcomes(
      ['@acme/kit'],
      kitWith({ main: './src/index.ts', exports: { './package.json': './package.json' } }),
    );
    expect(rows).toEqual([
      ['@acme/kit', 'unresolved-reference', 'Cannot resolve import "@acme/kit"'],
    ]);
  });
});

/** Resolves `specifier` from a file of layer `admin`, as resolveSpecifier does for an import. */
function resolveIn(root: string, specifier: string, typeStatement = false): unknown {
  const from = join(root, 'layers/admin/app/utils/use.ts');
  return resolveSpecifier(specifier, from, [], join(root, '.nuxt'), packagesOf(root), {
    typeStatement,
  });
}

describe('the types target, when the source target of exports is not built', () => {
  it.each([
    ['@acme/kit/foo', { './foo': { types: './foo.d.ts', import: './dist/foo.mjs' } }],
    ['@acme/kit', { '.': { types: './foo.d.ts', import: './dist/foo.mjs' } }],
  ])('gives the .d.ts file to a type import of %s', (specifier, exports) => {
    const root = project({
      [`${KIT}/package.json`]: JSON.stringify({ name: '@acme/kit', exports }),
      [`${KIT}/foo.d.ts`]: 'export type T = 1;\n',
    });
    expect(resolveIn(root, specifier, true)).toMatchObject({
      kind: 'file',
      file: join(realpathSync(join(root, KIT)), 'foo.d.ts'),
    });
    expect(resolveIn(root, specifier)).toEqual({ kind: 'missing' });
  });
});

describe('a path with a character that a URL reads in its own way', () => {
  it.each(['100%', 'my file'])('finds the file %s', name => {
    const root = project({ [`${UI_STORE}/app/${name}.ts`]: 'export const x = 1;\n' });
    expect(resolveIn(root, `@acme/ui-layer/app/${name}`)).toMatchObject({
      kind: 'file',
      file: join(realpathSync(join(root, UI_STORE)), `app/${name}.ts`),
    });
  });

  it('finds the file a#b, not the file a', () => {
    const root = project({
      [`${UI_STORE}/app/a.ts`]: 'export const a = 1;\n',
      [`${UI_STORE}/app/a#b.ts`]: 'export const b = 1;\n',
    });
    expect(resolveIn(root, '@acme/ui-layer/app/a#b')).toMatchObject({
      kind: 'file',
      file: join(realpathSync(join(root, UI_STORE)), 'app/a#b.ts'),
    });
  });
});

describe('a package.json that the resolver cannot parse', () => {
  it('stops the run when it is the package.json of the layer, with the message that names the file', () => {
    const root = project({ [`${KIT}/package.json`]: '{ "name": ' });
    expect(() => resolveIn(root, '@acme/kit/x')).toThrow(
      /^Invalid package\.json of layer "kit": Invalid package config \S+\/node_modules\/@acme\/kit\/package\.json/u,
    );
  });

  it('stops the run when the exports of the layer are not valid', () => {
    const root = project({
      [`${KIT}/package.json`]: JSON.stringify({
        name: '@acme/kit',
        exports: { '.': './x.ts', import: './x.ts' },
      }),
    });
    expect(() => resolveIn(root, '@acme/kit')).toThrow(/^Invalid package\.json of layer "kit": /u);
  });

  it('does not resolve the import, and does not stop, when it is a package.json of the importer', () => {
    const root = project({ 'layers/admin/app/utils/package.json': '{ "name": ' });
    expect(resolveIn(root, '@acme/kit/x')).toEqual({ kind: 'missing' });
  });
});

describe('the package.json that a resolver error is about', () => {
  const jsonError = (message: string): Error =>
    Object.assign(new Error(message), { code: 'ERR_INVALID_PACKAGE_CONFIG' });

  it('takes the file from the message of a JSON error, also a Windows path', () => {
    expect(
      failingManifest(
        jsonError(
          String.raw`Invalid package config C:\app\node_modules\@acme\kit\package.json while importing "@acme/kit" from C:\app\a.ts. Unexpected token`,
        ),
      ),
    ).toBe(String.raw`C:\app\node_modules\@acme\kit\package.json`);
    expect(failingManifest(jsonError('Invalid package config /a/package.json. Bad exports'))).toBe(
      '/a/package.json',
    );
    expect(failingManifest(jsonError('Invalid package config /a/package.json'))).toBe(
      '/a/package.json',
    );
  });

  it('takes the path of an fs error without the Windows prefix, only for a package.json', () => {
    const fsError = (path: string): Error =>
      Object.assign(new Error('EACCES'), { code: 'EACCES', path });
    expect(failingManifest(fsError(String.raw`\\?\C:\app\package.json`))).toBe(
      String.raw`C:\app\package.json`,
    );
    expect(failingManifest(fsError('/app/package.json'))).toBe('/app/package.json');
    expect(failingManifest(fsError('/app/src/x.ts'))).toBeNull();
    expect(failingManifest(fsError('/app/mypackage.json'))).toBeNull();
  });
});

describe('a broken package.json that is not the one of the layer', () => {
  it('does not stop the run for a copy of the package in node_modules of the importer', () => {
    const root = project({ 'layers/admin/node_modules/@acme/kit/package.json': '{ "name": ' });
    expect(resolveIn(root, '@acme/kit/x')).toEqual({ kind: 'missing' });
  });

  it('stops the run for an import from inside the layer, which reads the same file', () => {
    const root = project({
      [`${KIT}/package.json`]: JSON.stringify({
        name: '@acme/kit',
        exports: { '.': './x.ts', import: './x.ts' },
      }),
    });
    const from = join(root, KIT, 'app/composables/useKit.ts');
    expect(() =>
      resolveSpecifier('@acme/kit', from, [], join(root, '.nuxt'), packagesOf(root)),
    ).toThrow(/^Invalid package\.json of layer "kit": /u);
  });
});

describe.skipIf(CANNOT_DENY)('a package.json that the resolver cannot read', () => {
  function denied(path: string, check: (root: string) => void): void {
    const root = project({ [path]: JSON.stringify({ name: 'x' }) });
    chmodSync(join(root, path), 0o000);
    try {
      check(root);
    } finally {
      chmodSync(join(root, path), 0o600);
    }
  }

  it('stops the run when it is the package.json of the layer', () => {
    denied(`${KIT}/package.json`, root => {
      expect(() => resolveIn(root, '@acme/kit/x')).toThrow(
        /^Cannot read the package\.json of layer "kit" \(.+\/package\.json\): EACCES$/u,
      );
    });
  });

  it('does not resolve the import, and does not stop, when it is a package.json of the importer', () => {
    denied('layers/admin/app/utils/package.json', root => {
      expect(resolveIn(root, '@acme/kit/x')).toEqual({ kind: 'missing' });
    });
  });
});
