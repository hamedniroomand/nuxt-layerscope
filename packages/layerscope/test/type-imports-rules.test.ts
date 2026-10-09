import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { AnalysisCache } from '#src/analyze/cache.ts';
import { analyze } from '#src/analyze/index.ts';
import { Analyzer } from '#src/devtools/analyzer.ts';
import { computeEnvKey } from '#src/devtools/env-key.ts';
import type { TypeImports } from '#src/types.ts';
import { findUnused } from '#src/unused/index.ts';

import { base, run } from './type-imports-project.ts';
import { write } from './watch-project.ts';

describe('layer-cycle with typeImports', () => {
  function cycle(): string {
    const root = base();
    write(
      root,
      'layers/a/app/a.ts',
      "import type { A } from '../../b/app/types';\nexport type X = A;\n",
    );
    write(
      root,
      'layers/b/app/back.ts',
      "import { x } from '../../a/app/value';\nexport const y = x;\n",
    );
    write(root, 'layers/a/app/value.ts', 'export const x = 1;\n');
    return root;
  }
  const rules = { 'layer-cycle': 'error' } as const;

  it('finds a cycle through a type-only import with check, not with ignore', async () => {
    const root = cycle();
    const cycles = async (setting: TypeImports): Promise<number> =>
      (
        await run(root, setting, {
          layers: { a: { path: 'layers/a' }, b: { path: 'layers/b' } },
          rules,
        })
      ).findings.filter(finding => finding.rule === 'layer-cycle').length;
    expect(await cycles('check')).toBe(1);
    expect(await cycles('ignore')).toBe(0);
  });
});

describe('suggestions with typeImports', () => {
  it('counts only the value edges in a suggestion', async () => {
    const root = base();
    write(
      root,
      'layers/a/app/t.ts',
      "import type { A } from '../../b/app/types';\nexport type X = A;\n",
    );
    write(
      root,
      'layers/a/app/v.ts',
      "import { value } from '../../b/app/types';\nexport const x = value;\n",
    );
    const clears = async (setting: TypeImports): Promise<string[]> => {
      const result = await run(root, setting);
      return result.findings.map(finding => finding.suggestion?.message ?? '');
    };
    expect((await clears('check')).join('\n')).toContain('clears 2 findings');
    const ignored = (await clears('ignore')).join('\n');
    expect(ignored).toContain('clears 1 finding');
    expect(ignored).not.toContain('clears 2');
  });
});

describe('unused with typeImports', () => {
  it('lists a symbol that is used only through a type-only import as unused', async () => {
    const root = base();
    write(
      root,
      '.nuxt/types/imports.d.ts',
      "export {}\ndeclare global {\n  const useB: typeof import('../../layers/b/app/useB').useB\n}\n",
    );
    write(root, 'layers/b/app/useB.ts', 'export const useB = 1;\nexport type TB = 1;\n');
    write(
      root,
      'layers/a/app/t.ts',
      "import type { TB } from '../../b/app/useB';\nexport type X = TB;\n",
    );
    const names = async (setting: TypeImports): Promise<string[]> =>
      findUnused(await run(root, setting)).map(symbol => symbol.name);
    expect(await names('check')).toEqual([]);
    expect(await names('ignore')).toEqual(['useB']);
  });
});

describe('a change of typeImports in a long-running process', () => {
  const CONFIG = (value: string): string =>
    `export default { typeImports: '${value}', layers: { a: { path: 'layers/a', allow: [] }, b: { path: 'layers/b' } } };\n`;

  function project(): string {
    const root = base();
    write(
      root,
      'layers/a/app/t.ts',
      "import type { A } from '../../b/app/types';\nexport type X = A;\n",
    );
    write(root, 'layerscope.config.mjs', CONFIG('check'));
    return root;
  }

  it('drops the cache of analyze when the config file changes', async () => {
    const root = project();
    const cache = new AnalysisCache();
    const envKey = (): string => computeEnvKey(root, join(root, '.nuxt'));
    const first = await analyze({ rootDir: root, cache, envKey: envKey() });
    expect(first.findings).toHaveLength(1);
    write(root, 'layerscope.config.mjs', CONFIG('ignore'));
    const second = await analyze({ rootDir: root, cache, envKey: envKey() });
    expect(second.findings).toEqual([]);
    write(root, 'layerscope.config.mjs', CONFIG('check'));
    const third = await analyze({ rootDir: root, cache, envKey: envKey() });
    expect(third.findings).toHaveLength(1);
  });

  it('gives a new result in the analyzer of watch mode, DevTools and MCP', async () => {
    const root = project();
    const analyzer = new Analyzer({
      rootDir: root,
      baseline: join(root, 'layerscope-baseline.json'),
      envKey: (): string => computeEnvKey(root, join(root, '.nuxt')),
    });
    expect((await analyzer.get()).result.findings).toHaveLength(1);
    write(root, 'layerscope.config.mjs', CONFIG('ignore'));
    analyzer.invalidate();
    expect((await analyzer.get()).result.findings).toEqual([]);
  });
});
