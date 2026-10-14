import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeResult, Edge } from '#src/types.ts';

export const UI_STORE = 'node_modules/.pnpm/@acme+ui-layer@1.0.0/node_modules/@acme/ui-layer';
export const KIT = '../packages/kit-layer';

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

export function link(root: string, target: string, path: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  symlinkSync(join(root, target), join(root, path));
}

export const KIT_EXPORTS = {
  '.': './nuxt.config.ts',
  './x': { types: './x.d.ts', import: './x.ts' },
  './cjs': { require: './app/cjs.ts' },
  './package.json': './package.json',
  './app/private/*': null,
  './app/*': { types: './app/*.d.ts', import: './app/*.ts', require: './app/*.ts' },
  './require-first': { require: './x.cjs', import: './x.mjs' },
  './import-first': { import: './x.mjs', require: './x.cjs' },
  './env': { browser: './b.ts', node: './n.ts' },
  './lib/*': './lib/*',
  './types': { types: './types.d.ts' },
  './dev': { development: './src/index.ts', import: './dist/index.mjs' },
  './prod': { production: './dist/utils.mjs', default: './utils.ts' },
};

/**
 * An app in `<tmp>/app` with an npm layer `ui` (`@acme/ui-layer`, in the pnpm store, `exports: null`)
 * and a workspace layer `kit` (`@acme/kit`, in `<tmp>/packages`, with `exports`). Each layer has
 * `.d.ts` files next to its sources, so a resolver that picks the `types` condition gets a file
 * that exists. `@acme/ui` and `@acme/kit-extra` are packages that are not layers.
 */
export function project(files: Record<string, string> = {}): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-pkg-')));
  const root = join(base, 'app');
  const all: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'acme-app' }),
    [`${UI_STORE}/package.json`]: JSON.stringify({
      name: '@acme/ui-layer',
      main: './nuxt.config.ts',
      exports: null,
    }),
    [`${UI_STORE}/nuxt.config.ts`]: 'export default {};\n',
    [`${UI_STORE}/app/composables/useTheme.ts`]: 'export const useTheme = () => 1;\n',
    [`${UI_STORE}/app/composables/useTheme.d.ts`]: 'export declare const useTheme: () => 1;\n',
    [`${UI_STORE}/app/components/UiBadge.vue`]: '<template><span /></template>\n',
    [`${KIT}/package.json`]: JSON.stringify({ name: '@acme/kit', exports: KIT_EXPORTS }),
    [`${KIT}/nuxt.config.ts`]: 'export default {};\n',
    [`${KIT}/x.ts`]: 'export const x = 1;\n',
    [`${KIT}/x.d.ts`]: 'export declare const x: 1;\n',
    [`${KIT}/app/cjs.ts`]: 'export const cjs = 1;\n',
    [`${KIT}/x.cjs`]: 'module.exports = 1;\n',
    [`${KIT}/x.mjs`]: 'export default 1;\n',
    [`${KIT}/b.ts`]: 'export const env = 1;\n',
    [`${KIT}/n.ts`]: 'export const env = 2;\n',
    [`${KIT}/lib/useLib.ts`]: 'export const useLib = () => 1;\n',
    [`${KIT}/types.d.ts`]: 'export type T = 1;\n',
    [`${KIT}/src/index.ts`]: 'export const dev = 1;\n',
    [`${KIT}/utils.ts`]: 'export const utils = 1;\n',
    [`${KIT}/app/private/secret.ts`]: 'export const secret = 1;\n',
    [`${KIT}/app/composables/useKit.ts`]: 'export const useKit = () => 1;\n',
    [`${KIT}/app/composables/useKit.d.ts`]: 'export declare const useKit: () => 1;\n',
    'node_modules/@acme/ui/package.json': JSON.stringify({ name: '@acme/ui' }),
    'node_modules/@acme/ui/x.ts': 'export const x = 1;\n',
    'node_modules/@acme/kit-extra/package.json': JSON.stringify({ name: '@acme/kit-extra' }),
    'node_modules/@acme/kit-extra/x.ts': 'export const x = 1;\n',
    '.nuxt/types/imports.d.ts': `export {}\ndeclare global {\n  const useTheme: typeof import('../../${UI_STORE}/app/composables/useTheme').useTheme\n  const useKit: typeof import('../../${KIT}/app/composables/useKit').useKit\n}\n`,
    '.nuxt/components.d.ts': `export const UiBadge: typeof import('../${UI_STORE}/app/components/UiBadge.vue')['default']\n`,
    'layers/admin/app/pages/auto.vue':
      '<script setup lang="ts">\nconst a = [useTheme(), useKit()];\n</script>\n\n<template><UiBadge>{{ a }}</UiBadge></template>\n',
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    write(root, path, content);
  }
  link(root, UI_STORE, 'node_modules/@acme/ui-layer');
  link(root, KIT, 'node_modules/@acme/kit');
  return root;
}

export const LAYERS = {
  admin: { path: 'layers/admin', allow: [] },
  ui: { path: 'node_modules/@acme/ui-layer' },
  kit: { path: KIT },
};

export async function analyzeProject(root: string): Promise<AnalyzeResult> {
  const result = await analyze({ rootDir: root, config: { layers: LAYERS } });
  return result;
}

export function importsOf(result: AnalyzeResult, file: string): Edge[] {
  return result.edges.filter(edge => edge.kind === 'import' && edge.file === file);
}

/** The edge or the unresolved finding of each import in one file, in source order. */
export async function outcomes(
  imports: string[],
  extra: Record<string, string> = {},
): Promise<{ root: string; rows: (string | null)[][] }> {
  const source = imports.map((specifier, index) => `import * as m${index} from '${specifier}';\n`);
  const root = project({ 'layers/admin/app/utils/use.ts': source.join(''), ...extra });
  const result = await analyzeProject(root);
  const file = join(root, 'layers/admin/app/utils/use.ts');
  const rows = imports.map(specifier => {
    const edge = importsOf(result, file).find(candidate => candidate.symbol === specifier);
    if (edge !== undefined) {
      return [specifier, edge.to, edge.toLayer, edge.external];
    }
    const finding = result.findings.find(
      candidate => candidate.file === file && candidate.symbol === specifier,
    );
    return [specifier, finding?.rule ?? null, finding?.message ?? null];
  });
  return { root, rows };
}
