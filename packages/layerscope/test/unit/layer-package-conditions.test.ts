import { realpathSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { KIT, analyzeProject, importsOf, project } from '#test/layer-package-project.ts';

/** The target of the one import in each file, or its unresolved message. */
async function targets(files: Record<string, string>): Promise<Record<string, string>> {
  const root = project(
    Object.fromEntries(
      Object.entries(files).map(([name, code]) => [`layers/admin/app/utils/${name}`, code]),
    ),
  );
  const result = await analyzeProject(root);
  const kit = realpathSync(join(root, KIT));
  return Object.fromEntries(
    Object.keys(files).map(name => {
      const file = join(root, 'layers/admin/app/utils', name);
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
});
