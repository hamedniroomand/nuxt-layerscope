import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { dirname, join } from 'pathe';
import { afterAll, afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { exportedNames } from '#src/suggest/names.ts';

const EXTENSIONS = ['mts', 'cts', 'ts', 'tsx', 'mjs', 'cjs', 'js', 'jsx'];

// The unimport that Nuxt uses, from the repository's own install.
const require = createRequire(import.meta.url);
const unimportPath = createRequire(require.resolve('nuxt/package.json')).resolve('unimport');
const { scanExports } = (await import(pathToFileURL(unimportPath).href)) as {
  scanExports: (file: string, includeTypes: boolean) => Promise<{ name: string }[]>;
};

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A temp dir with `a.ts` that re-exports `specifier`, and the files that export a name each. */
function layout(specifier: string, files: string[]): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-star-')));
  dirs.push(dir);
  writeFileSync(join(dir, 'a.ts'), `export * from '${specifier}';\n`);
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), `export const ${file.replaceAll(/\W/gu, '_')} = 1;\n`);
  }
  return join(dir, 'a.ts');
}

const LAYOUTS: [string, string[]][] = [
  ...EXTENSIONS.map((ext): [string, string[]] => ['./x', [`x.${ext}`]]),
  ...EXTENSIONS.map((ext): [string, string[]] => ['./x', [`x/index.${ext}`]]),
  ['./x', ['x.ts', 'x/index.mts']],
  ['./x', ['x.js', 'x.ts']],
  ['./x', ['x/index.ts', 'x.js']],
  ['./x', ['x.tsx', 'x.ts']],
  ['./x', ['x.ts', 'x/index.ts']],
  ['./x/', ['x.ts', 'x/index.ts']],
  ['./x/', ['x.ts']],
  ['./z.ts', ['z.ts']],
  ['./y.js', ['y.ts']],
];

describe('the file of a relative export * from', () => {
  it.each(LAYOUTS)(
    'reads the names that unimport reads for %s with %j',
    async (specifier, files) => {
      vi.spyOn(console, 'warn').mockReturnValue();
      const file = layout(specifier, files);
      const real = (await scanExports(file, true)).map(entry => entry.name).toSorted();
      expect(exportedNames(file).names.toSorted()).toEqual(real);
      vi.restoreAllMocks();
    },
  );

  it('marks a file that unimport does not find as unknown', () => {
    expect(exportedNames(layout('./y.js', ['y.ts']))).toEqual({ names: [], unknown: true });
  });
});
