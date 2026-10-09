import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { ProjectSession } from '#src/mcp/session.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

import type { CanUseData } from './mcp-helpers.ts';
import { callTool, dataOf, sessionFor } from './mcp-helpers.ts';
import { tempDir } from './watch-project.ts';

function withLayers(layers: string): ProjectSession {
  const configFile = join(tempDir(), 'layerscope.config.mjs');
  writeFileSync(configFile, `export default { layers: ${layers} };\n`);
  return new ProjectSession({
    rootDir: NUXT4_ROOT,
    configFile,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
  });
}

async function canUse(from: string, to: string, session = sessionFor()): Promise<CanUseData> {
  const result = await callTool('can_use', { from, to }, session);
  return dataOf<CanUseData>(result);
}

async function failure(from: string, to: string): Promise<string> {
  const result = await callTool('can_use', { from, to });
  return result.isError ? (result.content[0]?.text ?? '') : '';
}

describe('can_use between layers', () => {
  it('says whether a layer may use another layer', async () => {
    expect(await canUse('admin', 'shared')).toMatchObject({ allowed: true, status: 'allowed' });
    expect(await canUse('admin', 'admin')).toMatchObject({ allowed: true });
    const refused = await canUse('admin', 'web');
    expect(refused).toMatchObject({ allowed: false, status: 'not-allowed' });
    expect(refused.reason).toContain('Ask the user before changing allow');
  });

  it('reports a scoped entry as partial, with its names', async () => {
    const session = withLayers("{ admin: { allow: [{ layer: 'web', only: ['useCart'] }] } }");
    expect(await canUse('admin', 'web', session)).toMatchObject({
      allowed: false,
      status: 'partial',
      only: ['useCart'],
    });
  });

  it('names what a layer exposes', async () => {
    const session = withLayers("{ admin: { allow: ['web'] }, web: { expose: ['useCart'] } }");
    const result = await canUse('admin', 'web', session);
    expect(result).toMatchObject({ allowed: true, exposed: ['useCart'] });
    expect(result.reason).toContain('only what it exposes: useCart');
  });

  it('refuses a name that is neither a layer nor a symbol', async () => {
    expect(await failure('admin', 'nothing')).toContain('not a layer or a known symbol');
  });
});

describe('can_use for a symbol', () => {
  it('resolves an auto-import and says which layer owns it', async () => {
    const result = await canUse('admin', 'useCart');
    expect(result).toMatchObject({
      allowed: false,
      status: 'not-allowed',
      to: { layer: 'web', kind: 'auto-import', symbol: 'useCart' },
    });
    expect(result.to.file).toBe('layers/web/app/composables/useCart.ts');
  });

  it('allows a symbol of a layer that may be used, and a symbol of the same layer', async () => {
    expect(await canUse('admin', 'formatPrice')).toMatchObject({ allowed: true });
    expect(await canUse('web', 'useCart')).toMatchObject({ status: 'same-layer', allowed: true });
  });

  it('uses the layer of a file, and its context for server utils', async () => {
    const panel = 'layers/admin/app/components/AdminPanel.vue';
    expect(await canUse(panel, 'useCart')).toMatchObject({
      allowed: false,
      from: { layer: 'admin', file: panel },
    });
    expect(await canUse('layers/admin/server/api/stats.get.ts', 'useDb')).toMatchObject({
      allowed: true,
    });
  });

  it.each(['CartSummary', 'LazyCartSummary', 'cart-summary'])(
    'finds the component by its spelling %s',
    async name => {
      expect(await canUse('admin', name)).toMatchObject({
        allowed: false,
        to: { layer: 'web', kind: 'component' },
      });
    },
  );

  it('says when a layer keeps a symbol internal', async () => {
    const session = withLayers("{ admin: { allow: ['web'] }, web: { expose: ['CartSummary'] } }");
    expect(await canUse('admin', 'CartSummary', session)).toMatchObject({ allowed: true });
    const hidden = await canUse('admin', 'getCartStore', session);
    expect(hidden).toMatchObject({ allowed: false, status: 'not-exposed' });
    expect(hidden.reason).toContain('exposes only CartSummary');
  });
});
