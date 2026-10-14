import { realpathSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { KIT, analyzeProject, importsOf, project } from '#test/layer-package-project.ts';

/** The target of the one import in each file, or its unresolved message. */
async function targets(
  files: Record<string, string>,
  dir = 'layers/admin/app/utils',
): Promise<Record<string, string>> {
  const root = project(
    Object.fromEntries(Object.entries(files).map(([name, code]) => [`${dir}/${name}`, code])),
  );
  const result = await analyzeProject(root);
  const kit = realpathSync(join(root, KIT));
  return Object.fromEntries(
    Object.keys(files).map(name => {
      const file = join(root, dir, name);
      const edge = importsOf(result, file).at(0);
      const finding = result.findings.find(candidate => candidate.file === file);
      const target =
        edge?.to === undefined || edge.to === null ? null : edge.to.slice(kit.length + 1);
      return [name, target ?? finding?.message ?? ''];
    }),
  );
}

describe('the exports condition of an import by the package name of a layer', () => {
  it('is import only for an import, whatever the key order', async () => {
    expect(
      await targets({
        'import.ts': "import x from '@acme/kit/require-first';\n",
        'export-from.ts': "export { default } from '@acme/kit/require-first';\n",
        'dynamic.ts': "export const x = import('@acme/kit/require-first');\n",
      }),
    ).toEqual({ 'import.ts': 'x.mjs', 'export-from.ts': 'x.mjs', 'dynamic.ts': 'x.mjs' });
  });

  it('is require and import for a require(), and the key order picks', async () => {
    expect(
      await targets({
        'require.cts': "const x = require('@acme/kit/require-first');\n",
        'import-equals.cts': "import x = require('@acme/kit/require-first');\n",
        'require-import-first.cts': "const x = require('@acme/kit/import-first');\n",
      }),
    ).toEqual({
      'require.cts': 'x.cjs',
      'import-equals.cts': 'x.cjs',
      'require-import-first.cts': 'x.mjs',
    });
  });

  it('does not give an import the target that only require() has, as in Node', async () => {
    expect(
      await targets({
        'import.ts': "import x from '@acme/kit/cjs';\n",
        'require.cts': "const x = require('@acme/kit/cjs');\n",
      }),
    ).toEqual({
      'import.ts': 'Cannot resolve import "@acme/kit/cjs"',
      'require.cts': 'app/cjs.ts',
    });
  });

  it('is browser or node in every context', async () => {
    const files = {
      'node.ts': "export * from '@acme/kit/node-only';\n",
      'browser.ts': "export * from '@acme/kit/browser-only';\n",
    };
    const app = await targets(files);
    const server = await targets(files, 'layers/admin/server/utils');
    expect([app, server]).toEqual([
      { 'node.ts': 'n.ts', 'browser.ts': 'b.ts' },
      { 'node.ts': 'n.ts', 'browser.ts': 'b.ts' },
    ]);
  });
});

describe('a require() of an import-only target', () => {
  it('resolves in server, app and shared code, as Nitro and the SSR build of Nuxt do', async () => {
    const files = {
      'require.cts': "const x = require('@acme/kit/x');\n",
      'import-equals.cts': "import x = require('@acme/kit/x');\n",
    };
    const resolved = { 'require.cts': 'x.ts', 'import-equals.cts': 'x.ts' };
    expect(await targets(files, 'layers/admin/server/utils')).toEqual(resolved);
    expect(await targets(files, 'layers/admin/app/utils')).toEqual(resolved);
    expect(await targets(files, 'layers/admin/shared/utils')).toEqual(resolved);
  });

  it('gives the boundary finding', async () => {
    const root = project({
      'layers/admin/server/utils/require.cts': "const x = require('@acme/kit/x');\n",
    });
    const result = await analyzeProject(root);
    const file = join(root, 'layers/admin/server/utils/require.cts');
    expect(
      result.findings
        .filter(finding => finding.file === file)
        .map(finding => [finding.rule, finding.toLayer]),
    ).toEqual([['layer-boundary', 'kit']]);
  });
});
