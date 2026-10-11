import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { dirname, join, relative, resolve } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = join(PACKAGE, 'src/');
const TESTS = join(PACKAGE, 'test/');

/** Static, side-effect and dynamic imports. The specifier must follow white space or line start. */
const SPECIFIER = /(?:^|\s)(?:from|import)\s*\(?\s*'([^']+)'/gmu;

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
  return files(root).flatMap(file =>
    [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
      .map(match => match[1])
      .filter(specifier =>
        specifier.startsWith('.')
          ? !resolve(dirname(file), specifier).startsWith(root)
          : !allowed(specifier),
      )
      .map(specifier => `${relative(PACKAGE, file)}: ${specifier}`),
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
