import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeResult, LayerscopeConfig } from '#src/types.ts';

import { check, files, git, reportOf } from './git-project.ts';
import { tempDir, write } from './watch-project.ts';

/** Two layers; `b` holds a `.cts` and a `.cjs` module, and `a` reaches them in each way. */
function twoLayers(): string {
  const root = tempDir();
  write(root, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(
    root,
    '.nuxt/tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '#layers/b/*': ['../layers/b/*'] } } }),
  );
  write(root, '.gitignore', '.nuxt\n');
  write(root, 'layers/b/app/utils/title.cts', 'module.exports = { title: 1 };\n');
  write(root, 'layers/b/app/utils/lib.cjs', 'exports.open = 1; exports.secret = 2;\n');
  write(
    root,
    'layers/a/app/utils/alias.cjs',
    "const t = require('#layers/b/app/utils/lib.cjs');\n",
  );
  write(
    root,
    'layers/a/app/utils/relative.js',
    "const t = require('../../../b/app/utils/title');\n",
  );
  return root;
}

const LAYERS = { a: { path: 'layers/a', allow: [] }, b: { path: 'layers/b' } };

async function run(root: string, config: LayerscopeConfig = {}): Promise<AnalyzeResult> {
  const result = await analyze({ rootDir: root, config: { layers: LAYERS, ...config } });
  return result;
}

const boundary = (result: AnalyzeResult): string[] =>
  result.findings
    .filter(finding => finding.rule === 'layer-boundary')
    .map(finding => `${finding.file.split('/layers/')[1]} → ${finding.toLayer}`)
    .toSorted();

describe('require() across layers', () => {
  it('gives a layer-boundary finding for an alias and for a relative path, in .cjs and .js', async () => {
    const result = await run(twoLayers());
    expect(boundary(result)).toEqual(['a/app/utils/alias.cjs → b', 'a/app/utils/relative.js → b']);
    expect(result.files.some(file => file.endsWith('alias.cjs'))).toBe(true);
  });

  it('resolves a require without an extension to a .cts file', async () => {
    const result = await run(twoLayers());
    const finding = result.findings.find(candidate => candidate.file.endsWith('relative.js'));
    expect(finding?.target?.endsWith('layers/b/app/utils/title.cts')).toBe(true);
  });

  it('gives no finding when the layer may use the other one', async () => {
    const result = await run(twoLayers(), {
      layers: { ...LAYERS, a: { path: 'layers/a', allow: ['b'] } },
    });
    expect(boundary(result)).toEqual([]);
  });
});

describe('import = require() in a .cts file', () => {
  it('gives a layer-boundary finding across layers', async () => {
    const root = twoLayers();
    write(
      root,
      'layers/a/app/utils/legacy.cts',
      "import lib = require('../../../b/app/utils/lib.cjs');\nexport = lib;\n",
    );
    const result = await run(root);
    expect(boundary(result)).toContain('a/app/utils/legacy.cts → b');
  });
});

describe('a destructured require and expose', () => {
  const read = (form: string) => async (): Promise<string[]> => {
    const root = twoLayers();
    write(root, 'layers/a/app/utils/alias.cjs', form);
    write(root, 'layers/a/app/utils/relative.js', 'export const x = 1;\n');
    const result = await analyze({
      rootDir: root,
      config: {
        layers: {
          a: { path: 'layers/a', allow: ['b'] },
          b: { path: 'layers/b', expose: ['open'] },
        },
      },
    });
    return result.findings
      .filter(finding => finding.rule === 'layer-internal')
      .map(finding => finding.symbol)
      .toSorted();
  };

  it('is checked against expose like a named import', async () => {
    const fromRequire = await read(
      "const { open, secret } = require('#layers/b/app/utils/lib.cjs');\n",
    )();
    const fromImport = await read(
      "import { open, secret } from '#layers/b/app/utils/lib.cjs';\n",
    )();
    expect(fromRequire).toEqual(fromImport);
    expect(fromRequire.length).toBeGreaterThan(0);
  });
});

describe('check --staged with a .cjs file', () => {
  it('selects a staged .cjs file', async () => {
    const root = twoLayers();
    write(root, 'layerscope.config.mjs', `export default { layers: ${JSON.stringify(LAYERS)} };\n`);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'start');
    write(
      root,
      'layers/a/app/utils/new.cjs',
      "const t = require('#layers/b/app/utils/lib.cjs');\n",
    );
    git(root, 'add', 'layers/a/app/utils/new.cjs');
    const result = await check([root, '--staged', '--format', 'json'], root);
    expect(files(reportOf(result))).toEqual(['layers/a/app/utils/new.cjs']);
    expect(result.code).toBe(1);
  });
});
