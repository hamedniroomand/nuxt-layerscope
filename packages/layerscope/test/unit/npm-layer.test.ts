import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';

const LAYER_STORE = 'node_modules/.pnpm/@acme+ui-layer@1.0.0/node_modules/@acme/ui-layer';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** A layer installed from npm the way pnpm links it, with hand-written generated types. */
function npmLayerProject(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-npm-')));
  write(root, `${LAYER_STORE}/app/composables/useTheme.ts`, 'export const useTheme = () => 1;\n');
  write(root, `${LAYER_STORE}/app/components/UiBadge.vue`, '<template><span /></template>\n');
  mkdirSync(join(root, 'node_modules/@acme'), { recursive: true });
  symlinkSync(join(root, LAYER_STORE), join(root, 'node_modules/@acme/ui-layer'));
  write(
    root,
    'layers/admin/app/pages/admin.vue',
    '<script setup lang="ts">\nconst theme = useTheme();\n</script>\n\n<template><UiBadge>{{ theme }}</UiBadge></template>\n',
  );
  write(
    root,
    '.nuxt/types/imports.d.ts',
    "export {}\ndeclare global {\n  const useTheme: typeof import('../../node_modules/@acme/ui-layer/app/composables/useTheme').useTheme\n}\n",
  );
  write(
    root,
    '.nuxt/components.d.ts',
    'export const UiBadge: typeof import("../node_modules/@acme/ui-layer/app/components/UiBadge.vue")[\'default\']\n',
  );
  return root;
}

describe('a layer installed from npm', () => {
  it('owns its files under node_modules, so boundaries apply', async () => {
    const root = npmLayerProject();
    const result = await analyze({
      rootDir: root,
      config: {
        layers: {
          admin: { path: 'layers/admin', allow: [] },
          ui: { path: 'node_modules/@acme/ui-layer' },
        },
      },
    });
    expect(result.findings.map(f => [f.rule, f.symbol, f.toLayer, f.target])).toEqual([
      ['layer-boundary', 'useTheme', 'ui', join(root, LAYER_STORE, 'app/composables/useTheme.ts')],
      ['layer-boundary', 'UiBadge', 'ui', join(root, LAYER_STORE, 'app/components/UiBadge.vue')],
    ]);
  });

  it('is resolved but not scanned', async () => {
    const root = npmLayerProject();
    const result = await analyze({
      rootDir: root,
      config: { layers: { ui: { path: 'node_modules/@acme/ui-layer' } } },
    });
    expect(result.files).toEqual([join(root, 'layers/admin/app/pages/admin.vue')]);
  });
});
