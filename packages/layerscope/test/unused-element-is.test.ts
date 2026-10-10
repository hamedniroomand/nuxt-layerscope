import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { findUnused } from '#src/unused/index.ts';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/**
 * One component that nothing imports, and one page in layer `web`. The layers are declared by path,
 * so no Nuxt install is needed.
 */
async function analyzeWith(page: string): Promise<AnalyzeResult> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-unused-is-')));
  write(root, 'layers/web/app/components/Unused.vue', '<template><div /></template>\n');
  write(
    root,
    '.nuxt/components.d.ts',
    'export const Unused: typeof import("../layers/web/app/components/Unused.vue")["default"]\n',
  );
  write(root, '.nuxt/types/imports.d.ts', 'export {}\n');
  write(root, 'layers/web/app/pages/page.vue', page);
  write(root, 'layers/admin/app/pages/admin.vue', '<template><div /></template>\n');
  write(
    root,
    'layerscope.config.mjs',
    "export default { layers: { web: { path: 'layers/web' }, admin: { path: 'layers/admin' } } };\n",
  );
  const result = await analyze({ rootDir: root });
  return result;
}

const TEMPLATE = (script: string, bound: string): string =>
  `<script setup lang="ts">\n${script}\n</script>\n<template><component :is="${bound}">a</component></template>\n`;

describe('unused with a dynamic component', () => {
  it('counts a string prop with an element default as a possible use by name', async () => {
    const result = await analyzeWith(
      TEMPLATE("withDefaults(defineProps<{ tag?: string }>(), { tag: 'span' });", 'tag'),
    );
    expect(result.findings.filter(finding => finding.rule === 'unresolved-reference')).toEqual([]);
    expect(result.dynamicComponentFiles).toHaveLength(1);
    expect(findUnused(result).map(symbol => [symbol.name, symbol.possiblyUsed])).toEqual([
      ['Unused', true],
    ]);
  });

  it('does not count a literal union of element names as a possible use', async () => {
    const result = await analyzeWith(TEMPLATE("defineProps<{ tag?: 'h1' | 'p' }>();", 'tag'));
    expect(findUnused(result).map(symbol => [symbol.name, symbol.possiblyUsed])).toEqual([
      ['Unused', false],
    ]);
  });

  it('does not count a literal element name as a possible use', async () => {
    const result = await analyzeWith(TEMPLATE('const ok = true;', "'span'"));
    expect(findUnused(result).map(symbol => [symbol.name, symbol.possiblyUsed])).toEqual([
      ['Unused', false],
    ]);
  });
});
