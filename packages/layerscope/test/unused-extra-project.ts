import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { findUnused } from '#src/unused/index.ts';

export type Files = Record<string, string>;

/** `name: file` pairs become auto-imports in the generated types, as Nuxt writes them. */
function importsDts(imports: Record<string, string>): string {
  const lines = Object.entries(imports).map(
    ([name, file]) => `  const ${name}: typeof import('../../${file}').${name}`,
  );
  return `declare global {\n${lines.join('\n')}\n}\nexport {}\n`;
}

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

export function writeProject(
  files: Files,
  imports: Record<string, string>,
  config = "{ layers: { web: { path: 'layers/web' } } }",
  serverImports: Record<string, string> = {},
  /** Makes the project root `app` in a new dir, so `../` is private to the project. */
  inOwnDir = false,
): string {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-extra-')));
  const root = inOwnDir ? join(parent, 'app') : parent;
  const all: Files = {
    '.nuxt/types/imports.d.ts': importsDts(imports),
    '.nuxt/types/nitro-imports.d.ts': importsDts(serverImports),
    '.nuxt/components.d.ts': 'export {}\n',
    'layers/web/app/pages/index.vue': '<template><div /></template>\n',
    'layerscope.config.mjs': `export default ${config};\n`,
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    write(root, path, content);
  }
  return root;
}

export const LIB_IMPORTS = { libA: 'layers/web/lib/libA.ts', libB: 'layers/web/lib/libB.ts' };
export const LIB: Files = {
  'layers/web/lib/libA.ts': 'export const libA = () => libB();\n',
  'layers/web/lib/libB.ts': 'export const libB = () => 1;\n',
};

export async function unusedNames(root: string): Promise<string[]> {
  const result = await analyze({ rootDir: root, extraFiles: true });
  return findUnused(result).map(symbol => symbol.name);
}
