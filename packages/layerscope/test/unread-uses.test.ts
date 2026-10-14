import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { applyBaseline, createBaseline } from '#src/baseline/index.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { AnalyzeResult } from '#src/types.ts';

import { makeLayer, noNuxtIgnore } from './factories.ts';
import { tempDir, write } from './watch-project.ts';

const NON_NULL = `<script setup lang="ts">
const bar = ref<string | null>('x')
</script>

<template>
  <div>{{ bar! }}<CartSummary />{{ useCart() }}</div>
</template>
`;

/**
 * Two layers declared by path, so no Nuxt install is needed: `admin` may not use `shop`. Both
 * sources are written: the `.d.ts` files and the registry.
 */
function project(config = ''): string {
  const root = tempDir();
  const useCart = join(root, 'layers/shop/app/composables/useCart.ts');
  const cartSummary = join(root, 'layers/shop/app/components/CartSummary.vue');
  write(root, 'layers/shop/app/composables/useCart.ts', 'export const useCart = () => 1;\n');
  write(root, 'layers/shop/app/components/CartSummary.vue', '<template><i /></template>\n');
  write(
    root,
    '.nuxt/types/imports.d.ts',
    "export {}\ndeclare global {\n  const useCart: typeof import('../../layers/shop/app/composables/useCart').useCart\n}\n",
  );
  write(
    root,
    '.nuxt/components.d.ts',
    "export const CartSummary: typeof import('../layers/shop/app/components/CartSummary.vue')['default']\n",
  );
  const registry: Registry = {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: [
      makeLayer('admin', join(root, 'layers/admin')),
      makeLayer('shop', join(root, 'layers/shop')),
    ],
    components: [
      { name: 'CartSummary', file: cartSummary, mode: 'all', island: false, priority: 0 },
    ],
    shadowedComponents: [],
    componentDirs: [],
    importDirs: [],
    nuxtIgnore: noNuxtIgnore(),
    imports: { app: [{ name: 'useCart', from: useCart }], server: [], shared: [] },
  };
  write(root, '.nuxt/layerscope/registry.json', JSON.stringify(registry));
  write(
    root,
    'layerscope.config.mjs',
    `export default { layers: { admin: { path: 'layers/admin', allow: [] }, shop: { path: 'layers/shop' } }${config} };\n`,
  );
  return root;
}

function boundary(result: AnalyzeResult, file: string): string[] {
  return result.findings
    .filter(finding => finding.rule === 'layer-boundary' && finding.file.endsWith(file))
    .map(finding => finding.symbol)
    .toSorted();
}

describe.each(['registry', 'types'] as const)('TypeScript in a template (--source %s)', source => {
  it('finds the uses that come after a non-null assertion', async () => {
    const root = project();
    write(root, 'layers/admin/app/pages/NonNull.vue', NON_NULL);
    const result = await analyze({ rootDir: root, source });
    expect(result.source).toBe(source);
    expect(boundary(result, 'NonNull.vue')).toEqual(['CartSummary', 'useCart']);
  });
});

describe('uses that cannot be read', () => {
  async function unreadFindings(files: Record<string, string>): Promise<AnalyzeResult> {
    const root = project();
    for (const [path, content] of Object.entries(files)) {
      write(root, join('layers/admin/app', path), content);
    }
    const result = await analyze({ rootDir: root, source: 'types' });
    return result;
  }

  it('reports them as unresolved-reference warnings, one per use', async () => {
    const result = await unreadFindings({
      'composables/useLoad.ts':
        'export const load = (a: string) => [import(`../../../shop/app/composables/${a}`), import(a)];\n',
      'pages/Pug.vue': '<template lang="pug">\ndiv\n  CartSummary\n</template>\n',
      'pages/Src.vue': '<template src="./x.html"></template>\n',
      'composables/useGlob.ts': "export const all = import.meta.glob('./*.ts');\n",
    });
    const found = result.findings
      .filter(finding => finding.message.startsWith('Could not read'))
      .map(finding => [
        finding.file.split('/').at(-1),
        finding.rule,
        finding.severity,
        finding.symbol,
      ]);
    expect(found.toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
      ['Pug.vue', 'unresolved-reference', 'warn', '<template>'],
      ['Src.vue', 'unresolved-reference', 'warn', '<template>'],
      ['useGlob.ts', 'unresolved-reference', 'warn', 'import.meta.glob()'],
      ['useLoad.ts', 'unresolved-reference', 'warn', 'import()'],
      ['useLoad.ts', 'unresolved-reference', 'warn', 'import()'],
    ]);
  });

  it('can be switched off with the rule severity', async () => {
    const root = project(", rules: { 'unresolved-reference': 'off' }");
    write(root, 'layers/admin/app/pages/Pug.vue', '<template lang="pug">\ndiv\n</template>\n');
    const result = await analyze({ rootDir: root, source: 'types' });
    expect(result.findings.some(finding => finding.message.startsWith('Could not read'))).toBe(
      false,
    );
  });
});

describe('a baseline of uses that cannot be read', () => {
  it('keeps two dynamic imports in one file as one baseline entry with a count', async () => {
    const root = project();
    const file = 'layers/admin/app/composables/useLoad.ts';
    write(root, file, 'export const load = (a: string, b: string) => [import(a), import(b)];\n');
    const first = await analyze({ rootDir: root, source: 'types' });
    const baseline = createBaseline(first.findings, root);
    const entry = baseline.entries.find(item => item.symbol === 'import()');
    expect(entry?.count).toBe(2);
    // A third dynamic import is new, and it is not hidden by the count.
    write(
      root,
      file,
      'export const load = (a: string, b: string, c: string) => [import(a), import(b), import(c)];\n',
    );
    const more = await analyze({ rootDir: root, source: 'types' });
    const next = applyBaseline(more.findings, baseline, 'baseline.json', root);
    expect(next.findings.filter(finding => finding.symbol === 'import()')).toHaveLength(1);
  });
});
