import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { formatUnused } from '#src/report/unused.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { findBlindSpots } from '#src/unused/blind-spots.ts';
import { findUnused } from '#src/unused/index.ts';

import { makeLayer, makeResult } from './factories.ts';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

const USED_PAGE = '<template><Used /></template>\n';

/** Layer `web` has the component `Used`, and `Lonely` when `lonely` is set. */
async function analyzeWith(
  files: Record<string, string>,
  options: { lonely?: boolean; ignore?: string[] } = {},
): Promise<{ result: AnalyzeResult; root: string }> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-blind-')));
  const names = options.lonely === true ? ['Used', 'Lonely'] : ['Used'];
  for (const name of names) {
    write(root, `layers/web/app/components/${name}.vue`, '<template><div /></template>\n');
  }
  write(
    root,
    '.nuxt/components.d.ts',
    names
      .map(
        name =>
          `export const ${name}: typeof import("../layers/web/app/components/${name}.vue")["default"]\n`,
      )
      .join(''),
  );
  write(root, '.nuxt/types/imports.d.ts', 'export {}\n');
  for (const [path, content] of Object.entries(files)) {
    write(root, path, content);
  }
  const ignore = options.ignore === undefined ? '' : `, ignore: ${JSON.stringify(options.ignore)}`;
  write(
    root,
    'layerscope.config.mjs',
    `export default { layers: { web: { path: 'layers/web' } }${ignore} };\n`,
  );
  return { result: await analyze({ rootDir: root }), root };
}

describe('unused blind spots: a parse error', () => {
  it('records a file with a parse error (case 5)', async () => {
    const { result, root } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/utils/broken.ts': 'export const = ;\n',
    });
    expect(result.unreadFiles).toEqual([
      { file: join(root, 'layers/web/app/utils/broken.ts'), reason: 'Could not parse file' },
    ]);
    expect(findBlindSpots(result)).toContainEqual({
      kind: 'unreadable',
      files: result.unreadFiles,
    });
  });

  it('does not print the all-clear line when a file could not be read (case 5)', async () => {
    const { result, root } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/utils/broken.ts': 'export const = ;\n',
    });
    expect(findUnused(result)).toEqual([]);
    const text = formatUnused(findUnused(result), 'text', root, findBlindSpots(result));
    expect(text).not.toContain('Every component and auto-import is referenced');
    expect(text).toBe(
      `${[
        'No unused symbol found. 1 file could not be read, so its uses are not counted.',
        'Files that could not be read:\n  layers/web/app/utils/broken.ts  Could not parse file',
        'Not counted as uses: test files.',
      ].join('\n\n')}\n`,
    );
  });
});

describe('unused blind spots: text report', () => {
  it('prints the symbols, then the unread files, then the one line (case 5)', async () => {
    const { result, root } = await analyzeWith(
      {
        'layers/web/app/pages/index.vue': USED_PAGE,
        'layers/web/app/utils/broken.ts': 'export const = ;\n',
      },
      { lonely: true },
    );
    const text = formatUnused(findUnused(result), 'text', root, findBlindSpots(result));
    expect(text.split('\n\n')).toEqual([
      expect.stringContaining('web\n  Lonely'),
      '1 unused symbol in 1 layer',
      'Files that could not be read:\n  layers/web/app/utils/broken.ts  Could not parse file',
      'Not counted as uses: test files.\n',
    ]);
  });

  it('uses the plural for more than one file (case 5)', async () => {
    const { result, root } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/utils/a.ts': 'export const = ;\n',
      'layers/web/app/utils/b.ts': 'export const = ;\n',
    });
    const text = formatUnused([], 'text', root, findBlindSpots(result));
    expect(text).toContain(
      'No unused symbol found. 2 files could not be read, so their uses are not counted.',
    );
  });
});

describe('unused blind spots: code that is not read', () => {
  it('records import() with a dynamic path (case 7)', async () => {
    const { result } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/utils/load.ts':
        'export const load = (name: string) => import(`./${name}.ts`);\n',
    });
    expect(result.unreadFiles.map(item => item.reason)).toEqual(['import() with a dynamic path']);
  });

  it('records a template that layerscope cannot read (case 7)', async () => {
    const { result } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/pages/pug.vue': '<template lang="pug">\n  Lonely\n</template>\n',
    });
    expect(result.unreadFiles.map(item => item.reason)).toEqual(['<template lang="pug">']);
  });
});

describe('unused blind spots: templates and globs', () => {
  it('names a template in a separate file (case 7)', async () => {
    const { result } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/pages/ext.vue': '<template src="./ext.html"></template>\n',
    });
    expect(result.unreadFiles.map(item => item.reason)).toEqual(['<template src="./ext.html">']);
  });

  it('keeps the whole reason when the path has a dot and a space', async () => {
    const { result } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/pages/ext.vue': '<template src="./a. b.html"></template>\n',
    });
    expect(result.unreadFiles.map(item => item.reason)).toEqual(['<template src="./a. b.html">']);
  });

  it('records import.meta.glob() (case 7)', async () => {
    const { result } = await analyzeWith({
      'layers/web/app/pages/index.vue': USED_PAGE,
      'layers/web/app/utils/all.ts': "export const all = import.meta.glob('./*.ts');\n",
    });
    expect(result.unreadFiles.map(item => item.reason)).toEqual(['import.meta.glob()']);
  });
});

describe('unused blind spots: rows', () => {
  it('keeps the unused rows as they are (no possiblyUsed on rows for unread files)', async () => {
    const { result } = await analyzeWith(
      {
        'layers/web/app/pages/index.vue': USED_PAGE,
        'layers/web/app/utils/broken.ts': 'export const = ;\n',
      },
      { lonely: true },
    );
    expect(findUnused(result).map(symbol => [symbol.name, symbol.possiblyUsed])).toEqual([
      ['Lonely', false],
    ]);
  });

  it('lists no unread file for a clean project', async () => {
    const { result } = await analyzeWith({ 'layers/web/app/pages/index.vue': USED_PAGE });
    expect(result.unreadFiles).toEqual([]);
    expect(findBlindSpots(result).map(spot => spot.kind)).toEqual(['test-files']);
  });
});

describe('unused blind spots: the other kinds', () => {
  it('names the ignore patterns only when the config has some (case 6)', async () => {
    const files = { 'layers/web/app/pages/index.vue': USED_PAGE };
    const plain = await analyzeWith(files);
    const ignored = await analyzeWith(files, { ignore: ['legacy/**'] });
    expect(findBlindSpots(plain.result).map(spot => spot.kind)).toEqual(['test-files']);
    expect(findBlindSpots(ignored.result).map(spot => spot.kind)).toEqual([
      'test-files',
      'ignored',
    ]);
  });

  it('names layers installed as packages only when one is present (case 3)', () => {
    const none = makeResult();
    const withPackage = makeResult({
      layers: [makeLayer('web', '/app'), makeLayer('ui', '/app/node_modules/ui')],
    });
    expect(findBlindSpots(none).map(spot => spot.kind)).toEqual(['test-files']);
    expect(findBlindSpots(withPackage).map(spot => spot.kind)).toEqual([
      'test-files',
      'package-layers',
    ]);
  });

  it('prints one line with only the parts that apply', () => {
    const result = makeResult({
      config: { ignore: ['legacy/**'] },
      layers: [makeLayer('ui', '/app/node_modules/ui')],
    });
    expect(formatUnused([], 'text', '/app', findBlindSpots(result))).toBe(
      '✔ Every component and auto-import is referenced\n\nNot counted as uses: test files, files matched by "ignore", files in layers installed as packages.\n',
    );
  });

  it('adds blindSpots to the JSON report and keeps version 1', () => {
    const result = makeResult({
      unreadFiles: [{ file: '/app/a.vue', reason: 'Could not parse file' }],
    });
    const report = JSON.parse(formatUnused([], 'json', '/app', findBlindSpots(result))) as unknown;
    expect(report).toEqual({
      version: 1,
      unused: [],
      blindSpots: [
        { kind: 'test-files' },
        { kind: 'unreadable', files: [{ file: 'a.vue', reason: 'Could not parse file' }] },
      ],
    });
  });
});
