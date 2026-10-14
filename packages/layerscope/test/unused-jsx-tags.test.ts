import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { findUnused } from '#src/unused/index.ts';

let root = '';
let result: AnalyzeResult;

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/**
 * Layer `web` has the components `AppUsed`, `KebabUsed` and `ServerOnly`. A `.tsx` file of the app
 * uses the first two, and one more tag that Nuxt has no component for. A `.tsx` file in the
 * `server/` dir uses `ServerOnly`, which Nitro does not change.
 */
beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-jsx-')));
  const names = ['AppUsed', 'KebabUsed', 'ServerOnly'];
  for (const name of names) {
    write(`layers/web/app/components/${name}.vue`, '<template><div /></template>\n');
  }
  write(
    '.nuxt/components.d.ts',
    names
      .map(
        name =>
          `export const ${name}: typeof import("../layers/web/app/components/${name}.vue")["default"]\n`,
      )
      .join(''),
  );
  write('.nuxt/types/imports.d.ts', 'export {}\n');
  write(
    'layers/web/app/pages/widget.tsx',
    'export default () => <div><AppUsed /><kebab-used /><NotAComponent /></div>;\n',
  );
  write('layers/web/server/api/render.tsx', 'export default () => <ServerOnly />;\n');
  write('layerscope.config.mjs', "export default { layers: { web: { path: 'layers/web' } } };\n");
  result = await analyze({ rootDir: root });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('unused and check with component tags in JSX (#119)', () => {
  it('counts the JSX tags of the app as uses, in PascalCase and in kebab-case', () => {
    expect(findUnused(result).map(symbol => symbol.name)).toEqual(['ServerOnly']);
  });

  it('reports a JSX tag that Nuxt has no component for, as for a template tag', () => {
    expect(result.findings.map(f => [f.rule, f.symbol, f.message])).toEqual([
      [
        'unresolved-reference',
        'NotAComponent',
        'Nuxt has no component <NotAComponent>; if it is registered at runtime, add it to "globals" in layerscope.config.ts',
      ],
    ]);
  });
});
