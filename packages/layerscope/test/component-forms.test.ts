import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeResult } from '#src/types.ts';

const CART = 'layers/shop/app/components/CartSummary.vue';
const USE_CART = 'layers/shared/app/composables/useCart.ts';

/** `shop` has `CartSummary`, `shared` has the auto-import `useCart`; `auth` may use only `shared`. */
function project(path: string, source: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-forms-')));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const files: Record<string, string> = {
    'package.json': '{ "name": "forms-app" }\n',
    'layerscope.config.mjs': `export default {
  layers: {
    shop: { path: 'layers/shop', allow: [] },
    shared: { path: 'layers/shared', allow: [] },
    auth: { path: 'layers/auth', allow: ['shared'] },
  },
};
`,
    // As Nuxt writes them: `h` and `resolveComponent` are auto-imports from `vue`.
    '.nuxt/types/imports.d.ts': [
      'export {}',
      'declare global {',
      `  const useCart: typeof import('../../${USE_CART}').useCart`,
      "  const h: typeof import('vue').h",
      "  const resolveComponent: typeof import('vue').resolveComponent",
      '}',
      '',
    ].join('\n'),
    '.nuxt/components.d.ts': [
      `export const CartSummary: typeof import("../${CART}")['default']`,
      `export const LazyCartSummary: LazyComponent<typeof import("../${CART}")['default']>`,
      '',
    ].join('\n'),
    [CART]: '<template><b /></template>\n',
    [USE_CART]: 'export const useCart = () => 1;\n',
    [path]: source,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

interface Outcome {
  /** `[kind, symbol, target file, target layer]` of each edge of the file. */
  edges: (string | null)[][];
  /** `[rule, message]` of each finding of the file. */
  findings: string[][];
}

async function outcome(path: string, source: string): Promise<Outcome> {
  const root = project(path, source);
  const result: AnalyzeResult = await analyze({ rootDir: root });
  const file = join(root, path);
  return {
    edges: result.edges
      .filter(edge => edge.file === file)
      .map(edge => [
        edge.kind,
        edge.symbol,
        edge.to === null ? null : relative(root, edge.to),
        edge.toLayer,
      ]),
    findings: result.findings
      .filter(finding => finding.file === file)
      .map(finding => [finding.rule, finding.message]),
  };
}

const VUE = 'layers/auth/app/pages/cart.vue';

function setup(code: string): string {
  return `<script setup lang="ts">\n${code}\n</script>\n\n<template><div /></template>\n`;
}

const CROSSING = [
  'layer-boundary',
  'Component <CartSummary> crosses from layer "auth" into "shop"',
];

describe('component uses that Nuxt resolves in a script', () => {
  it.each([
    [
      'a template literal in resolveComponent()',
      VUE,
      setup('const C = resolveComponent(`CartSummary`);'),
    ],
    [
      'a kebab-case name in resolveComponent()',
      VUE,
      setup("const C = resolveComponent('cart-summary');"),
    ],
    ['h() with a free name in a .vue file', VUE, setup('const render = () => h(CartSummary);')],
    [
      'h() with a free name in a .tsx file',
      'layers/auth/app/utils/cart.tsx',
      "import { h } from 'vue';\nexport const render = () => h(CartSummary);\n",
    ],
  ])('makes %s a component use', async (_name, path, source) => {
    const { edges, findings } = await outcome(path, source);
    expect(edges).toContainEqual(['component', 'CartSummary', CART, 'shop']);
    expect(findings).toEqual([CROSSING]);
  });

  // Nuxt changes `h(CartSummary)` by its text, so its component replaces the local one.
  it('makes h() with a local binding of a component name a component use', async () => {
    const { edges, findings } = await outcome(
      VUE,
      setup('const CartSummary = { render: () => null };\nconst render = () => h(CartSummary);'),
    );
    expect(edges).toContainEqual(['component', 'CartSummary', CART, 'shop']);
    expect(findings).toEqual([CROSSING]);
  });

  it('takes a Lazy name in kebab-case', async () => {
    const { edges } = await outcome(VUE, setup("const C = resolveComponent('lazy-cart-summary');"));
    expect(edges.filter(edge => edge[0] === 'component')).toEqual([
      ['component', 'LazyCartSummary', CART, 'shop'],
    ]);
  });
});

describe('h() where Nuxt does not change the name', () => {
  it('reports h() with a free name in a .ts file, where Nuxt does not change it', async () => {
    const { edges, findings } = await outcome(
      'layers/auth/app/composables/useCartNode.ts',
      "import { h } from 'vue';\nexport const useCartNode = () => h(CartSummary);\n",
    );
    expect(edges.filter(edge => edge[0] === 'component')).toEqual([]);
    expect(findings).toEqual([
      [
        'unresolved-reference',
        '"CartSummary" is a component, not an auto-import: use it in a template, or import it from "#components"',
      ],
    ]);
  });

  it('reports h() with a free name in a server .tsx file, where Nuxt does not change it', async () => {
    const { edges, findings } = await outcome(
      'layers/auth/server/utils/og.tsx',
      "import { h } from 'preact';\nexport const card = () => h(CartSummary);\n",
    );
    expect(edges.filter(edge => edge[0] === 'component')).toEqual([]);
    expect(findings.map(([rule]) => rule)).toEqual(['unresolved-reference']);
  });

  it('reports another bare use of the name in a file with h(CartSummary)', async () => {
    const { edges, findings } = await outcome(
      VUE,
      setup('const render = () => h(CartSummary);\nconsole.log(CartSummary);'),
    );
    expect(edges).toContainEqual(['component', 'CartSummary', CART, 'shop']);
    expect(findings.map(([rule]) => rule).toSorted()).toEqual([
      'layer-boundary',
      'unresolved-reference',
    ]);
  });
});

describe('other names and arguments that stay as they are', () => {
  it('keeps an auto-import in h() an auto-import', async () => {
    const { edges } = await outcome(VUE, setup('const render = () => h(useCart);'));
    expect(edges).toContainEqual(['auto-import', 'useCart', USE_CART, 'shared']);
    expect(edges.filter(edge => edge[0] === 'component')).toEqual([]);
  });

  it.each([
    ['a template literal with ${}', 'const C = resolveComponent(`Cart${kind}`);'],
    ['a variable', 'const C = resolveComponent(kind);'],
  ])('reports resolveComponent() with %s as a runtime value', async (_name, code) => {
    const { findings } = await outcome(VUE, setup(`const kind = 'Summary';\n${code}`));
    expect(findings).toEqual([
      [
        'unresolved-reference',
        'Dynamic component bound to a runtime value cannot be resolved statically',
      ],
    ]);
  });
});
