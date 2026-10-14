import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { onTestFinished } from 'vite-plus/test';

import type { AnalyzeResult } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

export const CLIENT = 'layers/shop/app/components/Pair.client.vue';
export const SERVER = 'layers/shared/app/components/Pair.server.vue';
export const USER = 'layers/auth/app/pages/auth.vue';

const CONFIG = `export default {
  layers: {
    shop: { path: 'layers/shop', allow: [] },
    shared: { path: 'layers/shared', allow: [] },
    auth: { path: 'layers/auth', allow: ['shared'] },
    web: { path: 'layers/web', allow: ['shop', 'shared'] },
  },
};
`;

/** The lines that `nuxi prepare` writes for `Pair`: one for each file, in Nuxt's order. */
function exportLines(files: string[]): string {
  const lines = files.flatMap(file => [
    `export const Pair: typeof import("../${file}")['default']`,
    `export const LazyPair: LazyComponent<typeof import("../${file}")['default']>`,
  ]);
  return `${lines.join('\n')}\nexport const componentNames: string[]\n`;
}

/** The same in `.nuxt/types/components.d.ts`, the form of Nuxt 4.1 and later without the root file. */
function interfaceLines(files: string[]): string {
  const members = files.flatMap(file => [
    `  Pair: typeof import("../../${file}")['default']`,
    `  LazyPair: LazyComponent<typeof import("../../${file}")['default']>`,
  ]);
  return `interface _GlobalComponents {\n${members.join('\n')}\n}\n`;
}

interface Layout {
  /** The component files of `Pair`, in Nuxt's order. */
  files?: string[];
  /** The text of the page in `auth`. */
  user?: string;
  /** `export`: `.nuxt/components.d.ts`; `interface`: only `.nuxt/types/components.d.ts`. */
  form?: 'export' | 'interface';
}

/** A project with `shop`, `shared`, `auth` and `web`, symbols from the generated `.d.ts` files. */
export function project({
  files = [CLIENT, SERVER],
  user = '<template><Pair /></template>\n',
  form = 'export',
}: Layout = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-pair-')));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const all: Record<string, string> = {
    'package.json': '{ "name": "pair-app" }\n',
    'layerscope.config.mjs': CONFIG,
    '.nuxt/types/imports.d.ts': 'export {}\ndeclare global {\n}\n',
    [USER]: user,
    'layers/web/app/pages/web.vue': '<template><Pair /></template>\n',
    ...(form === 'export'
      ? { '.nuxt/components.d.ts': exportLines(files) }
      : { '.nuxt/types/components.d.ts': interfaceLines(files) }),
    ...Object.fromEntries(files.map(file => [file, '<template><span /></template>\n'])),
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** The edges of the `auth` file as `[symbol, target file, target layer]`, sorted. */
export function usesOf(result: AnalyzeResult, root: string): string[][] {
  return result.edges
    .filter(edge => edge.file === join(root, USER))
    .map(edge => [edge.symbol, edge.to === null ? '' : relative(root, edge.to), edge.toLayer ?? ''])
    .toSorted((a, b) => compareStrings(a.join('\0'), b.join('\0')));
}

export function boundaryFindings(result: AnalyzeResult): (string | null)[][] {
  return result.findings
    .filter(finding => finding.rule === 'layer-boundary')
    .map(finding => [finding.fromLayer, finding.symbol, finding.toLayer]);
}
