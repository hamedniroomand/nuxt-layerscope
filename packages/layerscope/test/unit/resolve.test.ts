import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { loadAliases } from '#src/nuxt/aliases.ts';
import type { LayerPackages } from '#src/resolve/layer-package.ts';
import { packageName } from '#src/resolve/package-name.ts';
import { resolveSpecifier } from '#src/resolve/specifier.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const buildDir = join(NUXT4_ROOT, '.nuxt');
const aliases = loadAliases(buildDir);
const NO_LAYER_PACKAGES: LayerPackages = new Map();
const from = join(NUXT4_ROOT, 'layers/admin/app/utils/exportCsv.ts');

describe('resolveSpecifier', () => {
  it('resolves #layers aliases to files', () => {
    expect(
      resolveSpecifier(
        '#layers/web/app/composables/useCart',
        from,
        aliases,
        buildDir,
        NO_LAYER_PACKAGES,
      ),
    ).toEqual({
      kind: 'file',
      file: join(NUXT4_ROOT, 'layers/web/app/composables/useCart.ts'),
      module: null,
    });
  });

  it('resolves relative paths with extension lookup', () => {
    expect(
      resolveSpecifier('../composables/useAdminStats', from, aliases, buildDir, NO_LAYER_PACKAGES),
    ).toMatchObject({
      kind: 'file',
    });
  });

  it('reports relative imports that do not exist', () => {
    expect(resolveSpecifier('./nope', from, aliases, buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'missing',
    });
  });

  it('treats packages and virtual modules as external', () => {
    expect(resolveSpecifier('@vueuse/core/x', from, aliases, buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'external',
      module: '@vueuse/core',
    });
    expect(resolveSpecifier('virtual:pwa', from, aliases, buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'external',
      module: 'virtual:pwa',
    });
    expect(
      resolveSpecifier('#build/fetch.mjs', from, aliases, buildDir, NO_LAYER_PACKAGES),
    ).toEqual({
      kind: 'external',
      module: '#build',
    });
  });
});

describe('resolveSpecifier absolute and build paths', () => {
  it('resolves absolute paths the same as relatives', () => {
    const file = join(NUXT4_ROOT, 'layers/web/app/composables/useCart.ts');
    expect(resolveSpecifier(file, from, aliases, buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'file',
      file,
      module: null,
    });
  });

  it('treats the build dir itself as the #build virtual module', () => {
    expect(resolveSpecifier(buildDir, from, aliases, buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'external',
      module: '#build',
    });
  });
});

describe('resolveSpecifier under node_modules', () => {
  it('keeps the real file and the package, so a layer installed from npm can own it', () => {
    const resolution = resolveSpecifier('#app', from, aliases, buildDir, NO_LAYER_PACKAGES);
    expect(resolution).toMatchObject({ kind: 'file', module: 'nuxt' });
    expect(resolution.kind === 'file' && resolution.file).toContain('/node_modules/');
  });
});

describe('resolveSpecifier with hoisted packages', () => {
  /** Nuxt's `typescript.hoist` aliases `ofetch` to a package dir whose entry is in package.json. */
  function hoisted(withManifest: boolean): [string, string][] {
    const dir = join(realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-hoist-'))), 'ofetch');
    mkdirSync(dir, { recursive: true });
    if (withManifest) {
      writeFileSync(
        join(dir, 'package.json'),
        '{"name":"ofetch","exports":{".":"./dist/index.mjs"}}',
      );
    }
    return [['ofetch', dir]];
  }

  it('treats an aliased package directory as an external module', () => {
    const map = hoisted(true);
    expect(resolveSpecifier('ofetch', from, map, buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'external',
      module: 'ofetch',
    });
    expect(resolveSpecifier('ofetch/node', from, map, buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'external',
      module: 'ofetch',
    });
  });

  it('still reports an alias whose target is neither a file nor a package', () => {
    expect(resolveSpecifier('ofetch', from, hoisted(false), buildDir, NO_LAYER_PACKAGES)).toEqual({
      kind: 'missing',
    });
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
