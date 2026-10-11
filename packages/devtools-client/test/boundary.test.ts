import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { dirname, join, relative, resolve } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = join(PACKAGE, 'src/');
const TESTS = join(PACKAGE, 'test/');

/**
 * Static, side-effect and dynamic imports. A static import has a single or double quote after
 * `from` or `import`. A dynamic import has a single quote, a double quote or a backtick after
 * `import(`. Only a word character, `.`, `-`, `:` or `$` before the keyword rules it out, so
 * `[import('x')]` counts but an attribute such as `data-from="x"` does not.
 */
const SPECIFIER =
  /(?<![\w.$:-])(?:(?:from|import)\s*(['"])([^'"\n]+)\1|import\s*\(\s*(['"`])([^'"`\n]+)\3)/gu;

/** The module specifiers that a source text imports. */
export function specifiers(text: string): string[] {
  return [...text.matchAll(SPECIFIER)].map(match => (match[2] as string | undefined) ?? match[4]);
}

const TEST_PACKAGES = new Set([
  'vite-plus',
  'vite-plus/test',
  '@vue/test-utils',
  'axe-core',
  'pathe',
]);

function sourceAllowed(specifier: string): boolean {
  return specifier === 'vue' || specifier === '#contract' || specifier.startsWith('#client/');
}

function testAllowed(specifier: string): boolean {
  return (
    sourceAllowed(specifier) ||
    specifier === '#contract-testing' ||
    specifier.startsWith('#test/') ||
    specifier.startsWith('node:') ||
    TEST_PACKAGES.has(specifier)
  );
}

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(name => /\.(?:ts|vue)$/u.test(name))
    .map(name => join(dir, name));
}

/** The imports that `allowed` rejects. A relative import must stay inside `root`. */
function violations(root: string, allowed: (specifier: string) => boolean): string[] {
  return (
    files(root)
      // This file holds sample imports for the pattern test.
      .filter(file => !file.endsWith('boundary.test.ts'))
      .flatMap(file =>
        specifiers(readFileSync(file, 'utf8'))
          .filter(specifier =>
            specifier.startsWith('.')
              ? !resolve(dirname(file), specifier).startsWith(root)
              : !allowed(specifier),
          )
          .map(specifier => `${relative(PACKAGE, file)}: ${specifier}`),
      )
  );
}

describe('client boundary', () => {
  it('imports core only through the contract', () => {
    expect(violations(SOURCE, sourceAllowed)).toEqual([]);
  });

  it('imports core runtime in tests only through contract-testing', () => {
    expect(violations(TESTS, testAllowed)).toEqual([]);
  });
});

describe('the specifier pattern', () => {
  it.each([
    ["import x from '#a'", '#a'],
    ['import x from "#a"', '#a'],
    ["import type { X } from '#a'", '#a'],
    ["export { x } from '#a'", '#a'],
    ["import '#a'", '#a'],
    ["await import('#a')", '#a'],
    ['await import("#a")', '#a'],
    ['await import(`#a`)', '#a'],
    ["const lazy = [import('#a')]", '#a'],
    ["import(\n  '#a',\n)", '#a'],
  ])('finds the import in %s', (text, specifier) => {
    expect(specifiers(text)).toEqual([specifier]);
  });

  it('finds nothing in a text without an import', () => {
    expect(specifiers('const important = 1; // fromage')).toEqual([]);
  });
});

/** Core modules that `contract.ts` re-exports as values. The client bundles them. */
const CONTRACT_VALUE_MODULES = [
  '../layerscope/src/devtools/static-paths.ts',
  '../layerscope/src/graph/layout-size.ts',
  '../layerscope/src/report/why-labels.ts',
];

describe('the values of the contract', () => {
  it.each(CONTRACT_VALUE_MODULES)('%s has no import at run time', path => {
    const text = readFileSync(join(PACKAGE, path), 'utf8');
    const runtime = text.replaceAll(/^(?:import|export)\s+type\b[^;]*;/gmu, '');
    expect(specifiers(runtime)).toEqual([]);
  });
});
