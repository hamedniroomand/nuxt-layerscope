import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeResult, LayerscopeConfig, TypeImports } from '#src/types.ts';

import { tempDir, write } from './watch-project.ts';

export const FORMS: Record<string, string> = {
  'import-type.ts': "import type { A } from '../../b/app/types';\nexport type X = A;\n",
  'import-type-default.ts': "import type D from '../../b/app/types';\nexport type X = D;\n",
  'all-inline.ts': "import { type A, type B } from '../../b/app/types';\nexport type X = A | B;\n",
  'export-type.ts': "export type { A } from '../../b/app/types';\n",
  'export-inline.ts': "export { type A } from '../../b/app/types';\n",
  'export-type-star.ts': "export type * from '../../b/app/types';\n",
  'import-equals.cts': "import type x = require('../../b/app/types');\nexport type X = typeof x;\n",
};

export function layers(extra?: LayerscopeConfig['layers']): LayerscopeConfig['layers'] {
  return {
    a: { path: 'layers/a', allow: [] },
    b: { path: 'layers/b', allow: [] },
    ...extra,
  };
}

export function base(): string {
  const root = tempDir();
  write(root, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(
    root,
    'layers/b/app/types.ts',
    'export type A = 1;\nexport type B = 2;\nexport type C = 3;\nexport default 1;\nexport const value = 1;\n',
  );
  return root;
}

export async function run(
  root: string,
  typeImports?: TypeImports,
  config: Partial<LayerscopeConfig> = {},
): Promise<AnalyzeResult> {
  const result = await analyze({
    rootDir: root,
    config: { layers: layers(), typeImports, ...config },
  });
  return result;
}

export function symbolsOf(result: AnalyzeResult, file?: string): string[] {
  return result.findings
    .filter(
      finding =>
        finding.rule === 'layer-boundary' && (file === undefined || finding.file.endsWith(file)),
    )
    .map(finding => finding.symbol);
}

/** The result with `check` and with `ignore`. */
export async function runBoth(root: string): Promise<AnalyzeResult[]> {
  const results = await Promise.all([run(root, 'check'), run(root, 'ignore')]);
  return results;
}
