import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { findUnused } from '#src/unused/index.ts';

import { writeProject } from './unused-extra-project.ts';

const script = (code: string): string =>
  `<script setup lang="ts">\n${code}\n</script>\n<template><div /></template>\n`;

/** The names that `unused` lists; `typeImports` is the config value. The default run has no extras. */
async function listed(
  files: Record<string, string>,
  imports: Record<string, string>,
  typeImports: 'check' | 'ignore' = 'check',
  serverImports: Record<string, string> = {},
): Promise<string[]> {
  const root = writeProject(
    files,
    imports,
    `{ typeImports: '${typeImports}', layers: { web: { path: 'layers/web' } } }`,
    serverImports,
  );
  const result = await analyze({ rootDir: root });
  return findUnused(result).map(symbol => symbol.name);
}

const COMPOSABLES = {
  'layers/web/app/composables/useTypeofOnly.ts': 'export const useTypeofOnly = () => 1;\n',
  'layers/web/app/composables/useOther.ts': 'export const useOther = () => ({ value: 1 });\n',
};
const IMPORTS = {
  useTypeofOnly: 'layers/web/app/composables/useTypeofOnly.ts',
  useOther: 'layers/web/app/composables/useOther.ts',
};

describe('unused counts typeof in a type (case 4)', () => {
  it('lists a composable that nothing uses', async () => {
    expect(await listed(COMPOSABLES, IMPORTS)).toEqual(['useOther', 'useTypeofOnly']);
  });

  it('counts ReturnType<typeof useTypeofOnly> as a use', async () => {
    const files = {
      ...COMPOSABLES,
      'layers/web/app/pages/index.vue': script(
        'type R = ReturnType<typeof useTypeofOnly>;\nvoid (null as R | null);',
      ),
    };
    expect(await listed(files, IMPORTS)).toEqual(['useOther']);
  });
});

describe('unused counts typeof in more places (case 4)', () => {
  it('counts a qualified name: typeof useOther.value', async () => {
    const files = {
      ...COMPOSABLES,
      'layers/web/app/pages/index.vue': script(
        'type V = typeof useOther.value;\nvoid (null as V | null);',
      ),
    };
    expect(await listed(files, IMPORTS)).toEqual(['useTypeofOnly']);
  });

  it('does not count a name that the file declares itself', async () => {
    const files = {
      ...COMPOSABLES,
      'layers/web/app/pages/index.vue': script(
        'const useTypeofOnly = () => 2;\ntype T = typeof useTypeofOnly;\nvoid (null as T | null);',
      ),
    };
    expect(await listed(files, IMPORTS)).toEqual(['useOther', 'useTypeofOnly']);
  });

  it('counts typeof inside a function type and a method signature', async () => {
    const files = {
      ...COMPOSABLES,
      'layers/web/app/pages/index.vue': script(
        'type F = (a: typeof useTypeofOnly) => void;\ninterface I { m(a: typeof useOther): void }\nvoid (null as F | I | null);',
      ),
    };
    expect(await listed(files, IMPORTS)).toEqual([]);
  });

  it('gives no finding for a typeof of an unknown name', async () => {
    const root = writeProject(
      {
        ...COMPOSABLES,
        'layers/web/app/pages/index.vue': script(
          'type U = typeof nowhere;\nvoid (null as U | null);',
        ),
      },
      IMPORTS,
    );
    const result = await analyze({ rootDir: root });
    expect(result.findings.filter(finding => finding.rule === 'unresolved-reference')).toEqual([]);
  });
});

describe('unused counts import type when typeImports is ignore (case 4)', () => {
  const files = {
    'layers/web/app/utils/info.ts':
      'export interface Info { a: number }\nexport const infoUtil = () => 1;\n',
    'layers/web/app/utils/pair.ts':
      'export interface Pair { a: number }\nexport const pairUtil = () => 1;\n',
    'layers/web/app/pages/index.vue': script(
      "import type { Info } from '../utils/info';\nimport { type Pair } from '../utils/pair';\nvoid (null as Info | Pair | null);",
    ),
  };
  const imports = {
    infoUtil: 'layers/web/app/utils/info.ts',
    pairUtil: 'layers/web/app/utils/pair.ts',
  };

  it("counts both forms with 'ignore'", async () => {
    expect(await listed(files, imports, 'ignore')).toEqual([]);
  });

  it("counts both forms with 'check', as before", async () => {
    expect(await listed(files, imports, 'check')).toEqual([]);
  });
});

describe('unused counts typeof in an extra file in the server context', () => {
  it('finds a server name', async () => {
    const root = writeProject(
      {
        'layers/web/srvlib/sa.ts':
          'export const sa = () => 1;\ntype T = typeof sb;\nexport type { T };\n',
        'layers/web/srvlib/sb.ts': 'export const sb = () => 1;\n',
      },
      {},
      undefined,
      { sa: 'layers/web/srvlib/sa.ts', sb: 'layers/web/srvlib/sb.ts' },
    );
    const result = await analyze({ rootDir: root, extraFiles: true });
    expect(findUnused(result).map(symbol => symbol.name)).toEqual(['sa']);
  });
});

describe('a type-only import shadows the auto-import of the same name', () => {
  const forms: [string, string][] = [
    ['import type { a }', "import type { useA } from '../legacy/useA';"],
    ['import { type a }', "import { type useA } from '../legacy/useA';"],
    ['import type * as a', "import type * as useA from '../legacy/useA';"],
    ['import type a from', "import type useA from '../legacy/useA';"],
    [
      'import type a = require() (the tracker declares it; a regression test)',
      "import type useA = require('../legacy/useA');",
    ],
  ];

  it.each(forms)('does not count the auto-import for %s', async (_name, statement) => {
    const files = {
      'layers/web/app/composables/useA.ts': 'export const useA = () => 1;\n',
      'layers/web/app/legacy/useA.ts': 'export const useA = () => 2;\nexport default useA;\n',
      'layers/web/app/pages/index.vue': script(
        `${statement}\ntype T = ReturnType<typeof useA>;\nvoid (null as T | null);`,
      ),
    };
    const imports = { useA: 'layers/web/app/composables/useA.ts' };
    expect(await listed(files, imports)).toEqual(['useA']);
  });
});

describe('a mixed import from #imports with typeImports ignore', () => {
  it('counts the target that only the type name uses', async () => {
    const files = {
      'layers/web/app/composables/useA.ts': 'export const useA = () => 1;\n',
      'layers/web/app/composables/useB.ts': 'export const useB = () => 1;\n',
      'layers/web/app/composables/useC.ts': 'export const useC = () => 1;\n',
      'layers/web/app/pages/index.vue': script(
        "import { type useA, useB } from '#imports';\nvoid useB;\nvoid (null as typeof useA | null);",
      ),
    };
    const imports = {
      useA: 'layers/web/app/composables/useA.ts',
      useB: 'layers/web/app/composables/useB.ts',
      useC: 'layers/web/app/composables/useC.ts',
    };
    expect(await listed(files, imports, 'ignore')).toEqual(['useC']);
  });
});

describe('unused follows an import type under typeImports ignore (case 4)', () => {
  const imports = { useCart: 'layers/web/app/composables/useCart.ts' };
  const page = script("import type { Cart } from '../../lib/types';\nvoid (null as Cart | null);");
  const composable = {
    'layers/web/app/composables/useCart.ts': 'export const useCart = () => 1;\n',
  };

  it.each([
    ['a type', 'export type Cart = ReturnType<typeof useCart>;\n'],
    ['a value', 'export type Cart = number;\nexport const c = useCart();\n'],
  ])('reads the file that a type-only import reaches (%s)', async (_name, body) => {
    const files = {
      ...composable,
      'layers/web/app/pages/index.vue': page,
      'layers/web/lib/types.ts': body,
    };
    const root = writeProject(
      files,
      imports,
      "{ typeImports: 'ignore', layers: { web: { path: 'layers/web' } } }",
    );
    const result = await analyze({ rootDir: root, extraFiles: true });
    expect(findUnused(result).map(symbol => symbol.name)).toEqual([]);
  });

  it('follows a chain: a value import, then a type-only import', async () => {
    const files = {
      ...composable,
      'layers/web/app/pages/index.vue': script("import { a } from '../../lib/a';\nvoid a;"),
      'layers/web/lib/a.ts':
        "import type { Cart } from './types';\nexport const a: Cart | null = null;\n",
      'layers/web/lib/types.ts': 'export type Cart = number;\nexport const c = useCart();\n',
    };
    const root = writeProject(
      files,
      imports,
      "{ typeImports: 'ignore', layers: { web: { path: 'layers/web' } } }",
    );
    const result = await analyze({ rootDir: root, extraFiles: true });
    expect(findUnused(result).map(symbol => symbol.name)).toEqual([]);
  });
});
