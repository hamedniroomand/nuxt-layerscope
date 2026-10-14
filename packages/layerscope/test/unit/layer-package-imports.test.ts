import { realpathSync } from 'node:fs';

import { join, relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import {
  KIT,
  UI_STORE,
  analyzeProject,
  importsOf,
  outcomes,
  project,
  write,
} from '#test/layer-package-project.ts';

describe('the oracle: an import by package name', () => {
  it('goes to the file and layer of the auto-import or component of the same file', async () => {
    const root = project();
    const auto = await analyzeProject(root);
    const uses = auto.edges.filter(
      edge => edge.file === join(root, 'layers/admin/app/pages/auto.vue') && edge.to !== null,
    );
    expect(uses.map(edge => edge.symbol).toSorted()).toEqual(['UiBadge', 'useKit', 'useTheme']);
    const packages = [
      { name: '@acme/ui-layer', dir: realpathSync(join(root, UI_STORE)) },
      { name: '@acme/kit', dir: realpathSync(join(root, KIT)) },
    ];
    const specifiers = uses.map(edge => {
      const to = edge.to ?? '';
      const owner = packages.find(pkg => to.startsWith(`${pkg.dir}/`));
      // A component keeps its `.vue`; a composable drops `.ts`, as source imports do.
      return `${owner?.name}/${relative(owner?.dir ?? '', to).replace(/\.ts$/u, '')}`;
    });
    // Only the first use of a specifier in a file makes an edge, so `require()` has its own file.
    write(
      root,
      'layers/admin/app/utils/explicit.ts',
      specifiers.map((specifier, index) => `import * as m${index} from '${specifier}';\n`).join(''),
    );
    write(
      root,
      'layers/admin/app/utils/explicit-require.cts',
      specifiers.map((specifier, index) => `const r${index} = require('${specifier}');\n`).join(''),
    );
    const result = await analyzeProject(root);
    for (const name of ['explicit.ts', 'explicit-require.cts']) {
      const importer = join(root, 'layers/admin/app/utils', name);
      expect(importsOf(result, importer).map(edge => [edge.symbol, edge.to, edge.toLayer])).toEqual(
        uses.map((edge, index) => [specifiers[index], edge.to, edge.toLayer]),
      );
      const boundary = result.findings.filter(
        finding => finding.rule === 'layer-boundary' && finding.file === importer,
      );
      expect(boundary.map(finding => [finding.symbol, finding.toLayer])).toEqual(
        uses.map((edge, index) => [specifiers[index], edge.toLayer]),
      );
    }
  });
});

describe('an import by the package name of a layer', () => {
  it('resolves through exports: a pattern, a require-only target, and not the types target', async () => {
    const { root, rows } = await outcomes([
      '@acme/kit/x',
      '@acme/kit/cjs',
      '@acme/kit/app/composables/useKit',
    ]);
    const kit = realpathSync(join(root, KIT));
    expect(rows).toEqual([
      ['@acme/kit/x', join(kit, 'x.ts'), 'kit', null],
      ['@acme/kit/cjs', join(kit, 'app/cjs.ts'), 'kit', null],
      ['@acme/kit/app/composables/useKit', join(kit, 'app/composables/useKit.ts'), 'kit', null],
    ]);
  });

  it('resolves the package root, and a .js path of a package without exports to the .ts file', async () => {
    const { root, rows } = await outcomes([
      '@acme/ui-layer',
      '@acme/kit',
      '@acme/ui-layer/app/composables/useTheme.js',
    ]);
    const ui = realpathSync(join(root, UI_STORE));
    const kit = realpathSync(join(root, KIT));
    expect(rows).toEqual([
      ['@acme/ui-layer', join(ui, 'nuxt.config.ts'), 'ui', null],
      ['@acme/kit', join(kit, 'nuxt.config.ts'), 'kit', null],
      [
        '@acme/ui-layer/app/composables/useTheme.js',
        join(ui, 'app/composables/useTheme.ts'),
        'ui',
        null,
      ],
    ]);
  });
});

describe('an import that does not go to the layer of its package name', () => {
  it('is unresolved when exports give null, when exports do not have the path, or when the file is not there', async () => {
    const specifiers = [
      '@acme/kit/app/private/secret',
      '@acme/kit/nuxt.config.ts',
      '@acme/kit/app/composables/nope',
      '@acme/ui-layer/app/composables/nope',
    ];
    const { rows } = await outcomes(specifiers);
    expect(rows).toEqual(
      specifiers.map(specifier => [
        specifier,
        'unresolved-reference',
        `Cannot resolve import "${specifier}"`,
      ]),
    );
  });

  it('matches the whole package name: a package whose name starts or ends the same stays external', async () => {
    const { rows } = await outcomes([
      '@acme/ui/x',
      '@acme/kit-extra/x',
      '@acme/kit-extra/nope',
      'left-pad',
    ]);
    expect(rows).toEqual([
      ['@acme/ui/x', null, null, '@acme/ui'],
      ['@acme/kit-extra/x', null, null, '@acme/kit-extra'],
      ['@acme/kit-extra/nope', null, null, '@acme/kit-extra'],
      ['left-pad', null, null, 'left-pad'],
    ]);
  });

  it('goes to a file outside the layer when the importer finds another copy of the package', async () => {
    const copy = 'layers/admin/node_modules/@acme/ui-layer';
    const { root, rows } = await outcomes(['@acme/ui-layer/app/composables/useTheme'], {
      [`${copy}/package.json`]: JSON.stringify({ name: '@acme/ui-layer' }),
      [`${copy}/app/composables/useTheme.ts`]: 'export const useTheme = () => 2;\n',
    });
    expect(rows).toEqual([
      ['@acme/ui-layer/app/composables/useTheme', null, null, '@acme/ui-layer'],
    ]);
    expect(realpathSync(join(root, copy))).not.toBe(realpathSync(join(root, UI_STORE)));
  });
});
