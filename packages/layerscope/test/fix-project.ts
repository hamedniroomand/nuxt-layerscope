import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { prepareApply, realIo, runApply } from '#src/fix/apply.ts';
import { planMoves } from '#src/fix/plan.ts';
import type { PlannedMove } from '#src/fix/types.ts';

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

export function page(...lines: string[]): string {
  return `<script setup lang="ts">\n${lines.join('\n')}\n</script>\n`;
}

/** An empty project; the layers come from `layerscope.config.mjs`. */
export function empty(layers: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-plan-')));
  write(root, '.nuxt/components.d.ts', '\n');
  write(root, '.nuxt/types/imports.d.ts', 'export {}\n');
  write(root, 'layerscope.config.mjs', `export default { layers: { ${layers} } };\n`);
  return root;
}

export const SHARED = "shared: { path: 'layers/shared', allow: [] }";
export const WEB = "web: { path: 'layers/web', allow: [] }";
export const ADMIN = "admin: { path: 'layers/admin', allow: ['shared'] }";
export const SHOP = "shop: { path: 'layers/shop', allow: ['shared'] }";

export const CART = 'layers/web/app/composables/useCart.ts';
export const IMPORT_CART = "import { useCart } from '../../../web/app/composables/useCart';";

/** admin and shop both import useCart from web, which neither may use. */
export function cartProject(layers: string[]): string {
  const root = empty(layers.join(',\n'));
  write(root, CART, 'export const useCart = () => 1;\n');
  write(root, 'layers/shared/app/utils/noop.ts', 'export const noop = () => 0;\n');
  write(root, 'layers/admin/app/pages/admin.vue', page(IMPORT_CART, 'useCart();'));
  write(root, 'layers/shop/app/pages/shop.vue', page(IMPORT_CART, 'useCart();'));
  return root;
}

export async function plan(root: string, baseline?: string): Promise<PlannedMove[]> {
  return planMoves(await analyze({ rootDir: root, baseline }));
}

/** Points the generated types at the new place, as `check --prepare` does. */
function retarget(root: string, move: PlannedMove): void {
  const from = relative(root, move.from);
  const to = relative(root, move.to);
  for (const file of ['.nuxt/types/imports.d.ts', '.nuxt/components.d.ts']) {
    const path = join(root, file);
    const types = readFileSync(path, 'utf8');
    const noExtension = (name: string): string => name.replace(/\.\w+$/u, '');
    writeFileSync(path, types.replaceAll(from, to).replaceAll(noExtension(from), noExtension(to)));
  }
}

/** Applies the plan with the real writer of `fix --apply`; the project is not in git. */
export async function applyPlan(root: string, baseline?: string): Promise<void> {
  const moves = await plan(root, baseline);
  const prepared = prepareApply(moves, root, { allowDirty: true, cwd: root });
  const result = runApply(prepared, realIo(root));
  if (result.failure !== null) {
    throw new Error(result.failure);
  }
  for (const move of moves) {
    retarget(root, move);
  }
}

export function checkArgs(root: string): string[] {
  return ['node', 'layerscope', 'check', root];
}
