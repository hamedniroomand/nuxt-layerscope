import { describe, expect, it } from 'vite-plus/test';

import type { TypeImports } from '#src/types.ts';

import { base, FORMS, layers, run, runBoth, symbolsOf } from './type-imports-project.ts';
import { tempDir, write } from './watch-project.ts';

describe.each(Object.entries(FORMS))('a type-only import in %s', (name, code) => {
  const file = `layers/a/app/${name}`;

  it.each([undefined, 'check'] as const)('is a finding with typeImports %s', async setting => {
    const root = base();
    write(root, file, code);
    const result = await run(root, setting);
    expect(symbolsOf(result)).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
  });

  it('gives no finding and no edge with ignore', async () => {
    const root = base();
    write(root, file, code);
    const result = await run(root, 'ignore');
    expect(result.findings).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

describe('a mixed import', () => {
  const MIXED =
    "import { value, type A } from '../../b/app/types';\nexport const x: A = value as never;\n";

  it('keeps all names with check and only the value names with ignore', async () => {
    const root = base();
    write(root, 'layers/a/app/mixed.ts', MIXED);
    const check = await run(root, 'check');
    const ignore = await run(root, 'ignore');
    expect(check.edges[0].names).toEqual(['value', 'A']);
    expect(ignore.edges[0].names).toEqual(['value']);
    expect(symbolsOf(ignore)).toHaveLength(1);
  });

  it('keeps a default import and drops the type name', async () => {
    const root = base();
    write(
      root,
      'layers/a/app/mixed.ts',
      "import D, { type B } from '../../b/app/types';\nexport const x: B = D as never;\n",
    );
    expect((await run(root, 'ignore')).edges[0].names).toEqual(['default']);
  });

  it('applies expose to the value names only', async () => {
    const root = base();
    write(root, 'layers/a/app/mixed.ts', MIXED);
    const config = layers({
      a: { path: 'layers/a', allow: ['b'] },
      b: { path: 'layers/b', expose: ['value'] },
    });
    const internal = async (setting: TypeImports): Promise<number> => {
      const result = await run(root, setting, { layers: config });
      return result.findings.filter(finding => finding.rule === 'layer-internal').length;
    };
    // `A` is not exposed: a finding with check, none with ignore.
    expect(await internal('check')).toBe(1);
    expect(await internal('ignore')).toBe(0);
  });

  it('applies a scoped allow to the value names only', async () => {
    const root = base();
    write(root, 'layers/a/app/mixed.ts', MIXED);
    const config = layers({ a: { path: 'layers/a', allow: [{ layer: 'b', only: ['value'] }] } });
    const count = async (setting: TypeImports): Promise<number> =>
      (await run(root, setting, { layers: config })).findings.length;
    expect(await count('check')).toBe(1);
    expect(await count('ignore')).toBe(0);
  });
});

describe('a name that a type and a value both bring in', () => {
  it.each([
    ['import', "import { type A, A as B } from '../../b/app/types';\nexport const x = B;\n"],
    ['re-export', "export { type A, A as B } from '../../b/app/types';\n"],
  ])('stays a dependency in a %s', async (_kind, code) => {
    const root = base();
    write(root, 'layers/a/app/both.ts', code);
    const results = await runBoth(root);
    for (const result of results) {
      expect(symbolsOf(result)).toHaveLength(1);
      expect(result.edges[0].names).toEqual(['A', 'A']);
    }
  });

  it('stays a dependency in an import of #imports', async () => {
    const root = tempDir();
    write(
      root,
      '.nuxt/types/imports.d.ts',
      "export {}\ndeclare global {\n  const useB: typeof import('../../layers/b/app/useB').useB\n}\n",
    );
    write(root, '.nuxt/components.d.ts', '\n');
    write(root, 'layers/b/app/useB.ts', 'export const useB = 1;\n');
    write(
      root,
      'layers/a/app/c.ts',
      "import { type useB, useB as other } from '#imports';\nexport const x = other;\n",
    );
    const results = await runBoth(root);
    for (const result of results) {
      expect(result.edges.map(edge => edge.symbol)).toEqual(['#imports:useB']);
    }
  });
});

describe('a re-export without names', () => {
  it('is a dependency with check and with ignore, as it loads the module', async () => {
    const root = base();
    write(root, 'layers/a/app/empty.ts', "export {} from '../../b/app/types';\n");
    const results = await runBoth(root);
    for (const result of results) {
      expect(symbolsOf(result)).toHaveLength(1);
    }
  });

  it('is ignored when it has the type keyword', async () => {
    const root = base();
    write(root, 'layers/a/app/empty.ts', "export type {} from '../../b/app/types';\n");
    expect(symbolsOf(await run(root, 'check'))).toHaveLength(1);
    expect(symbolsOf(await run(root, 'ignore'))).toHaveLength(0);
  });
});

describe('a virtual module import', () => {
  it('drops the type names of #imports', async () => {
    const root = tempDir();
    write(
      root,
      '.nuxt/types/imports.d.ts',
      "export {}\ndeclare global {\n  const useB: typeof import('../../layers/b/app/useB').useB\n  const useC: typeof import('../../layers/b/app/useB').useC\n}\n",
    );
    write(root, '.nuxt/components.d.ts', '\n');
    write(root, 'layers/b/app/useB.ts', 'export const useB = 1;\nexport const useC = 1;\n');
    write(
      root,
      'layers/a/app/c.ts',
      "import { useB, type useC } from '#imports';\nexport const x: typeof useC = useB as never;\n",
    );
    const check = await run(root, 'check');
    const ignore = await run(root, 'ignore');
    expect(check.edges.map(edge => edge.symbol)).toEqual(['#imports:useB', '#imports:useC']);
    expect(ignore.edges.map(edge => edge.symbol)).toEqual(['#imports:useB']);
  });
});

describe('what stays the same', () => {
  it('still reports a type-only import of a missing path', async () => {
    const root = base();
    write(
      root,
      'layers/a/app/gone.ts',
      "import type { A } from './missing';\nexport type X = A;\n",
    );
    const result = await run(root, 'ignore');
    expect(result.findings.map(finding => finding.rule)).toEqual(['unresolved-reference']);
  });

  it('still counts a side-effect import and a value import', async () => {
    const root = base();
    write(root, 'layers/a/app/side.ts', "import '../../b/app/types';\n");
    write(
      root,
      'layers/a/app/value.ts',
      "import { value } from '../../b/app/types';\nexport const x = value;\n",
    );
    expect(symbolsOf(await run(root, 'ignore'))).toHaveLength(2);
  });

  it('finds the same result with the default and with check', async () => {
    const root = base();
    for (const [name, code] of Object.entries(FORMS)) {
      write(root, `layers/a/app/${name}`, code);
    }
    const none = await run(root);
    const check = await run(root, 'check');
    expect(none.findings).toEqual(check.findings);
    expect(none.edges).toEqual(check.edges);
  });

  it('applies to a .vue script block', async () => {
    const root = base();
    write(
      root,
      'layers/a/app/Card.vue',
      '<script setup lang="ts">\nimport type { A } from "../../b/app/types";\ndefineProps<{ a: A }>();\n</script>\n<template><div /></template>\n',
    );
    expect(symbolsOf(await run(root, 'check'))).toHaveLength(1);
    expect(symbolsOf(await run(root, 'ignore'))).toHaveLength(0);
  });
});
