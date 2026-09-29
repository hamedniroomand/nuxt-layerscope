import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { loadAliases } from '#src/nuxt/aliases.ts';
import { packageName } from '#src/resolve/package-name.ts';
import { resolveSpecifier } from '#src/resolve/specifier.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const buildDir = join(NUXT4_ROOT, '.nuxt');
const aliases = loadAliases(buildDir);
const from = join(NUXT4_ROOT, 'layers/admin/app/utils/exportCsv.ts');

describe('resolveSpecifier', () => {
  it('resolves #layers aliases to files', () => {
    expect(
      resolveSpecifier('#layers/web/app/composables/useCart', from, aliases, buildDir),
    ).toEqual({
      kind: 'file',
      file: join(NUXT4_ROOT, 'layers/web/app/composables/useCart.ts'),
      module: null,
    });
  });

  it('resolves relative paths with extension lookup', () => {
    expect(resolveSpecifier('../composables/useAdminStats', from, aliases, buildDir)).toMatchObject(
      {
        kind: 'file',
      },
    );
  });

  it('reports relative imports that do not exist', () => {
    expect(resolveSpecifier('./nope', from, aliases, buildDir)).toEqual({ kind: 'missing' });
  });

  it('treats packages and virtual modules as external', () => {
    expect(resolveSpecifier('@vueuse/core/x', from, aliases, buildDir)).toEqual({
      kind: 'external',
      module: '@vueuse/core',
    });
    expect(resolveSpecifier('virtual:pwa', from, aliases, buildDir)).toEqual({
      kind: 'external',
      module: 'virtual:pwa',
    });
    expect(resolveSpecifier('#build/fetch.mjs', from, aliases, buildDir)).toEqual({
      kind: 'external',
      module: '#build',
    });
  });
});

describe('resolveSpecifier under node_modules', () => {
  it('keeps the real file and the package, so a layer installed from npm can own it', () => {
    const resolution = resolveSpecifier('#app', from, aliases, buildDir);
    expect(resolution).toMatchObject({ kind: 'file', module: 'nuxt' });
    expect(resolution.kind === 'file' && resolution.file).toContain('/node_modules/');
  });
});

describe('packageName', () => {
  it('handles scoped packages and node_modules paths', () => {
    expect(packageName('/a/node_modules/.pnpm/x/node_modules/@nuxt/kit/dist/index.mjs')).toBe(
      '@nuxt/kit',
    );
    expect(packageName('vue/server-renderer')).toBe('vue');
  });
});
