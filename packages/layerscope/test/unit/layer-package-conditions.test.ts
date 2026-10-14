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
  it('is import for an import and require for a require(), whatever the key order', async () => {
    expect(
      await targets({
        'import.ts': "import x from '@acme/kit/require-first';\n",
        'export-from.ts': "export { default } from '@acme/kit/require-first';\n",
        'dynamic.ts': "export const x = import('@acme/kit/require-first');\n",
        'require.cts': "const x = require('@acme/kit/import-first');\n",
        'import-equals.cts': "import x = require('@acme/kit/import-first');\n",
      }),
    ).toEqual({
      'import.ts': 'x.mjs',
      'export-from.ts': 'x.mjs',
      'dynamic.ts': 'x.mjs',
      'require.cts': 'x.cjs',
      'import-equals.cts': 'x.cjs',
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

  it('is node and not browser for server code, and both for app and shared code', async () => {
    const code = "import { env } from '@acme/kit/env';\nexport const e = env;\n";
    const where = await Promise.all(
      ['layers/admin/server/utils', 'layers/admin/app/utils', 'layers/admin/shared/utils'].map(
        async dir => Object.values(await targets({ 'env.ts': code }, dir))[0],
      ),
    );
    // App and shared code also run in the client bundle, so the first key, `browser`, wins.
    expect(where).toEqual(['n.ts', 'b.ts', 'b.ts']);
  });
});
