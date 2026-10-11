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

const REPOSITORY = join(PACKAGE, '../../');
const CORE_SRC = join(PACKAGE, '../layerscope/src/');
const CONTRACT = join(CORE_SRC, 'devtools/contract.ts');

/** The module specifiers that a file imports or re-exports at run time: no `import type`. */
function runtimeSpecifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8').replaceAll(/^(?:import|export)\s+type\b[^;]*;/gmu, '');
  return specifiers(text);
}

/** Whether the specifier is a core module, not a Node built-in or a package. */
function isCoreSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('#src/');
}

/** A core module that `contract.ts` uses at run time. The client bundles it. */
function coreModule(specifier: string): string {
  return specifier.startsWith('#src/')
    ? join(CORE_SRC, specifier.slice('#src/'.length))
    : resolve(dirname(CONTRACT), specifier);
}

const CONTRACT_IMPORTS = runtimeSpecifiers(CONTRACT);
const CONTRACT_MODULES = CONTRACT_IMPORTS.filter(specifier => isCoreSpecifier(specifier)).map(
  specifier => coreModule(specifier),
);

describe('the values of the contract', () => {
  it('finds the value re-exports', () => {
    expect(CONTRACT_MODULES.length).toBeGreaterThan(0);
  });

  it('uses only core modules at run time, no Node built-in and no package', () => {
    expect(CONTRACT_IMPORTS.filter(specifier => !isCoreSpecifier(specifier))).toEqual([]);
  });

  it.each(CONTRACT_MODULES.map(path => [relative(REPOSITORY, path), path]))(
    '%s has no import at run time',
    (_name, path) => {
      expect(runtimeSpecifiers(path)).toEqual([]);
    },
  );
});
