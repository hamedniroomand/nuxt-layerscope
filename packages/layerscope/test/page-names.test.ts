import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { AnalyzeResult, LayerscopeConfig } from '#src/types.ts';

import { makeLayer, noNuxtIgnore } from './factories.ts';

const LAYERS = ['web', 'admin', 'shop', 'base'];

/** The files of the `shop` layer that a page can name. */
const NAMED = {
  layouts: { shop: 'layers/shop/layouts/shop.vue', wide: 'layers/shop/layouts/wide.vue' },
  middleware: { auth: 'layers/shop/middleware/auth.ts', '2fa': 'layers/shop/middleware/2fa.ts' },
};

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function page(meta: string): string {
  return `<script setup lang="ts">\ndefinePageMeta(${meta});\n</script>\n`;
}

/**
 * A project with the layers `web`, `admin`, `shop` and `base`, and a registry as the Nuxt module
 * writes it: `shop` has the layouts `shop` and `wide` and the middleware `auth` and `2fa`.
 */
function project(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-page-names-')));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  for (const path of [...Object.values(NAMED.layouts), ...Object.values(NAMED.middleware)]) {
    write(root, path, path.endsWith('.vue') ? '<template><slot /></template>\n' : 'export {};\n');
  }
  for (const [path, content] of Object.entries(files)) {
    write(root, path, content);
  }
  const named = (entries: Record<string, string>): Registry['layouts'] =>
    Object.entries(entries).map(([name, file]) => ({ name, file: join(root, file) }));
  const registry: Registry = {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: LAYERS.map(name => makeLayer(name, join(root, 'layers', name))),
    components: [],
    shadowedComponents: [],
    shadowedLayouts: [],
    shadowedMiddleware: [],
    shadowedPages: [],
    shadowedImports: [],
    layouts: named(NAMED.layouts),
    middleware: named(NAMED.middleware),
    componentDirs: [],
    importDirs: [],
    nuxtIgnore: noNuxtIgnore(),
    nuxtContent: false,
    imports: { app: [], server: [], shared: [] },
  };
  write(root, '.nuxt/layerscope/registry.json', JSON.stringify(registry));
  return root;
}

async function check(root: string, layers: LayerscopeConfig['layers']): Promise<AnalyzeResult> {
  const config: LayerscopeConfig = { layers, rules: { 'unresolved-reference': 'off' } };
  const result = await analyze({ rootDir: root, config, source: 'registry' });
  return result;
}

describe('a layout or middleware name across layers', () => {
  it('gives an edge to the file that Nuxt uses for each known name, in the app only', async () => {
    const root = project({
      'layers/web/pages/index.vue': page("{ layout: 'shop', middleware: ['auth', 'missing'] }"),
      'layers/web/composables/useWide.ts': "export const useWide = () => setPageLayout('wide');\n",
      // `setPageLayout` does not run in Nitro.
      'layers/web/server/api/x.ts': "export default () => setPageLayout('shop');\n",
    });
    const result = await check(root, { web: { allow: [] } });
    expect(
      result.edges.map(edge => [edge.kind, edge.symbol, relative(root, edge.to ?? '')]),
    ).toEqual([
      ['layout', 'wide', NAMED.layouts.wide],
      ['layout', 'shop', NAMED.layouts.shop],
      ['middleware', 'auth', NAMED.middleware.auth],
    ]);
    expect(result.findings.map(finding => finding.message)).toEqual([
      'Layout "wide" crosses from layer "web" into "shop"',
      'Layout "shop" crosses from layer "web" into "shop"',
      'Middleware "auth" crosses from layer "web" into "shop"',
    ]);
  });
});

describe('the suggestions for a layout or middleware name', () => {
  it('suggests an only entry that clears the findings', async () => {
    const root = project({
      'layers/web/pages/index.vue': page("{ layout: 'shop', middleware: 'auth' }"),
    });
    const before = await check(root, { web: { allow: [] } });
    const only = before.findings[0]?.suggestion?.only;
    expect(only).toEqual(['auth', 'shop']);
    const after = await check(root, { web: { allow: [{ layer: 'shop', only: only ?? [] }] } });
    expect(after.findings).toEqual([]);
  });

  it('suggests the whole layer when a name would be read as a glob in an only list', async () => {
    const root = project({ 'layers/web/pages/index.vue': page("{ middleware: '2fa' }") });
    const [finding] = (await check(root, { web: { allow: [] } })).findings;
    expect(finding.suggestion).toMatchObject({ action: 'allow', impact: { edges: 1 } });
    expect(finding.suggestion?.only).toBeUndefined();
    expect((await check(root, { web: { allow: ['shop'] } })).findings).toEqual([]);
  });

  it('suggests expose entries that clear the internal findings', async () => {
    const root = project({
      'layers/web/pages/index.vue': page("{ layout: 'shop', middleware: '2fa' }"),
    });
    const before = await check(root, { web: { allow: ['shop'] }, shop: { expose: [] } });
    const expose = before.findings.map(finding => finding.suggestion?.expose ?? '');
    expect(expose).toEqual(['shop', 'middleware/2fa.ts']);
    const after = await check(root, { web: { allow: ['shop'] }, shop: { expose } });
    expect(after.findings).toEqual([]);
  });

  it('does not move a layout that pages of two layers use, but allows it', async () => {
    const root = project({
      'layers/web/pages/index.vue': page("{ layout: 'shop' }"),
      'layers/admin/pages/admin.vue': page("{ layout: 'shop' }"),
    });
    const result = await check(root, { web: { allow: ['base'] }, admin: { allow: ['base'] } });
    expect(result.findings.map(finding => finding.suggestion?.action)).toEqual(['allow', 'allow']);
  });
});
