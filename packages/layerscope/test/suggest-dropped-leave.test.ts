import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';

import { ADMIN, SHOP, empty, page, write } from './fix-project.ts';

const DROPPED =
  'leave it: allowing "admin" to use "web" would create a cycle, and the plan drops the move of this file because check would show new findings after the moves';
const NO_TARGET =
  'leave it: allowing "admin" to use "web" would create a cycle, and no layer every user may depend on can hold it';

/**
 * web may use admin and shop, so an allow from them to web makes a cycle. admin and shop import
 * useCart from web, which imports a file of web. `shared` sets whether shared may use web, and so
 * whether shared can hold useCart.
 */
function project(shared: string): string {
  const root = empty(
    `${[
      "web: { path: 'layers/web', allow: ['shared', 'admin', 'shop'] }",
      shared,
      ADMIN,
      SHOP,
    ].join(',\n')} }, rules: { 'layer-cycle': 'error' `,
  );
  write(root, 'layers/web/app/utils/secret.ts', 'export const secret = 1;\n');
  write(
    root,
    'layers/web/app/composables/useCart.ts',
    "import { secret } from '../utils/secret';\nexport const useCart = () => secret;\n",
  );
  write(
    root,
    'layers/web/app/pages/home.vue',
    page("import { useCart } from '../composables/useCart';", 'useCart();'),
  );
  write(root, 'layers/shared/app/utils/noop.ts', 'export const noop = 0;\n');
  for (const layer of ['admin', 'shop']) {
    write(
      root,
      `layers/${layer}/app/pages/p.vue`,
      page("import { useCart } from '../../../web/app/composables/useCart';", 'useCart();'),
    );
  }
  return root;
}

async function adminLeave(shared: string): Promise<string | undefined> {
  const result = await analyze({ rootDir: project(shared) });
  const finding = result.findings.find(item => item.fromLayer === 'admin');
  expect(finding?.suggestion?.action).toBe('leave');
  return finding?.suggestion?.message;
}

describe('the leave suggestion of a cycle', () => {
  it('says that the plan drops the move when the move makes a new cycle', async () => {
    // shared may use web, so shared can hold useCart, but then web and shared use each other.
    expect(await adminLeave("shared: { path: 'layers/shared', allow: ['web'] }")).toBe(DROPPED);
  });

  it('says that no layer can hold the file when there is no target', async () => {
    // shared may not use web, so useCart cannot go to shared: its import of secret would break.
    expect(await adminLeave("shared: { path: 'layers/shared', allow: [] }")).toBe(NO_TARGET);
  });
});
