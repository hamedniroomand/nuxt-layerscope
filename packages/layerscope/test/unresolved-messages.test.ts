import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vite-plus/test';

import { createAnalysisEnv } from '#src/analyze/analysis-env.ts';
import { FileAnalysis } from '#src/analyze/file-analysis.ts';
import { analyze } from '#src/analyze/index.ts';
import { tableFromRegistry } from '#src/registry/read.ts';
import { scanFile } from '#src/scan/index.ts';
import { makeLayer, makeRegistry } from '#test/factories.ts';

const CART = 'layers/shop/app/components/CartSummary.vue';
const USE_CART = 'layers/web/app/composables/useCart.ts';

/** `shop` has `CartSummary`, `web` has the app composable `useCart`, and `auth` uses them. */
async function messagesOf(path: string, source: string, globals: string[] = []): Promise<string[]> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-messages-')));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const files: Record<string, string> = {
    'package.json': '{ "name": "messages-app" }\n',
    'layerscope.config.mjs': `export default {
  globals: ${JSON.stringify(globals)},
  layers: {
    shop: { path: 'layers/shop' },
    web: { path: 'layers/web' },
    auth: { path: 'layers/auth' },
  },
};
`,
    '.nuxt/types/imports.d.ts': `export {}\ndeclare global {\n  const useCart: typeof import('../../${USE_CART}').useCart\n}\n`,
    '.nuxt/components.d.ts': `export const CartSummary: typeof import("../${CART}")['default']\n`,
    [CART]: '<template><b /></template>\n',
    [USE_CART]: 'export const useCart = () => 1;\n',
    [path]: source,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  const result = await analyze({ rootDir: root });
  return result.findings
    .filter(finding => finding.file === join(root, path) && finding.rule === 'unresolved-reference')
    .map(finding => finding.message);
}

const GLOBALS_HINT = 'if it is registered at runtime, add it to "globals" in layerscope.config.ts';

describe('the message of a name that another context or a component has', () => {
  it('names the context of an auto-import and gives no globals hint', async () => {
    const messages = await messagesOf(
      'layers/auth/server/utils/total.ts',
      'export const total = () => useCart();\n',
    );
    expect(messages).toEqual([
      '"useCart" is an auto-import only in the app context, not in the server context',
    ]);
  });

  it('says that a name is a component, with advice in the app context', async () => {
    const messages = await messagesOf(
      'layers/auth/app/utils/cart.ts',
      'console.log(CartSummary);\n',
    );
    expect(messages).toEqual([
      '"CartSummary" is a component, not an auto-import: use it in a template, or import it from "#components"',
    ]);
  });

  it('says that a name is a component, with no advice in the server context', async () => {
    const messages = await messagesOf(
      'layers/auth/server/utils/cart.ts',
      'console.log(CartSummary);\n',
    );
    expect(messages).toEqual([
      '"CartSummary" is a component, not an auto-import in the server context',
    ]);
  });

  it('keeps the globals hint for a name that no layer has', async () => {
    const messages = await messagesOf('layers/auth/app/utils/x.ts', 'console.log(trackEvent);\n');
    expect(messages).toEqual([
      `"trackEvent" is not a local binding, a known global or an auto-import in the app context; ${GLOBALS_HINT}`,
    ]);
  });

  it('reports no name that is in globals', async () => {
    const messages = await messagesOf('layers/auth/app/utils/x.ts', 'console.log(trackEvent);\n', [
      'trackEvent',
    ]);
    expect(messages).toEqual([]);
  });
});

describe('the message of a component tag that Nuxt does not have', () => {
  const TAG = `Nuxt has no component <NoSuchThing>; ${GLOBALS_HINT}`;

  it('names no generated file, with the .d.ts source', async () => {
    const messages = await messagesOf(
      'layers/auth/app/pages/x.vue',
      '<template><NoSuchThing /></template>\n',
    );
    expect(messages).toEqual([TAG]);
  });

  it('names no generated file, with a table from the registry', () => {
    const table = tableFromRegistry(makeRegistry(), '/app/.nuxt');
    const layer = makeLayer('auth', '/app/layers/auth');
    const env = createAnalysisEnv(table, () => layer, '/app/.nuxt', {}, [layer]);
    const file = '/app/layers/auth/pages/x.vue';
    const source = '<template><NoSuchThing /></template>\n';
    const analysis = new FileAnalysis(file, source, layer, env).run(scanFile(source, file));
    expect(analysis.unresolved.map(finding => finding.message)).toEqual([TAG]);
  });
});
