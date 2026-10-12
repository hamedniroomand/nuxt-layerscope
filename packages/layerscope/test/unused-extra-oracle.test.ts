import { chmodSync, symlinkSync } from 'node:fs';

import { join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { run } from '#src/cli.ts';
import { formatResult } from '#src/report/index.ts';

import type { Files } from './unused-extra-project.ts';
import { LIB, LIB_IMPORTS, writeProject } from './unused-extra-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('unused reads a file once', () => {
  it('lists a file that is a symbol file and a link once', async () => {
    const root = writeProject(
      {
        'layers/web/lib/real/broken.ts': 'export const = ;\n',
        'layers/web/lib/libA.ts': "import './real/broken';\nexport const libA = () => 1;\n",
      },
      { libA: 'layers/web/lib/libA.ts', broken: 'layers/web/lib/real/broken.ts' },
    );
    symlinkSync(join(root, 'layers/web/lib/real'), join(root, 'layers/web/app/linked'));
    const result = await analyze({ rootDir: root, extraFiles: true });
    expect(result.unreadFiles.filter(item => item.file.endsWith('broken.ts'))).toHaveLength(1);
  });
});

describe('extra files are off by default', () => {
  it('gives no extraEdges without the option', async () => {
    const root = writeProject(LIB, LIB_IMPORTS);
    const result = await analyze({ rootDir: root });
    expect(result.extraEdges).toEqual([]);
    expect(result.unreadFiles).toEqual([]);
  });
});

const layers =
  "{ layers: { web: { path: 'layers/web', allow: [] }, base: { path: 'layers/base' } } }";
const common: Files = {
  'layers/base/app/utils/baseUtil.ts': 'export const baseUtil = () => 1;\n',
  'layers/web/app/pages/index.vue':
    '<script setup lang="ts">\nimport { baseUtil } from \'../../../base/app/utils/baseUtil\';\nbaseUtil();\n</script>\n<template><div /></template>\n',
  'layers/web/nuxt.config.ts':
    "import { baseUtil } from '../base/app/utils/baseUtil';\nexport default { x: baseUtil(), y: nowhere() };\n",
  'layers/web/modules/m.ts':
    "import { baseUtil } from '../../base/app/utils/baseUtil';\nbaseUtil();\n",
  'layers/web/modules/broken.ts': 'export const = ;\n',
  'layers/web/lib/libA.ts':
    "import { baseUtil } from '../../base/app/utils/baseUtil';\nimport Dyn from './Dyn.vue';\nbaseUtil(); unknownThing(); void Dyn;\n",
  'layers/web/lib/Dyn.vue':
    '<script setup lang="ts">\nconst which = globalThis.name;\n</script>\n<template><component :is="which" /></template>\n',
};
const imports = { libA: 'layers/web/lib/libA.ts' };

async function outputs(root: string, extraFiles: boolean): Promise<string[]> {
  const result = await analyze({ rootDir: root, extraFiles });
  const clean = (text: string): string => text.replaceAll(root, '<root>');
  return [
    clean(formatResult(result, 'text', root)),
    clean(formatResult(result, 'json', root)),
    clean(result.notes.join('\n')),
    String(result.findings.some(finding => finding.severity === 'error')),
  ];
}

async function check(root: string): Promise<{ code: number; text: string }> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  out.mockClear();
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', 'check', root]);
  const text = out.mock.calls.map(call => String(call[0])).join('');
  // The report prints paths relative to the current dir.
  return { code, text: text.replaceAll(relative(process.cwd(), root), '<root>') };
}

describe('extra files do not change check', () => {
  it('gives the same text, JSON, notes and exit status with the option on and off', async () => {
    const root = writeProject(common, imports, layers);
    const off = await outputs(root, false);
    const on = await outputs(root, true);
    expect(on).toEqual(off);
    expect(off[3]).toBe('true');
    const result = await analyze({ rootDir: root, extraFiles: true });
    expect(result.extraEdges.length).toBeGreaterThan(0);
    expect(result.unreadFiles.map(item => item.reason)).toContain('Could not parse file');
    expect(result.files.every(file => !file.includes('/lib/'))).toBe(true);
  });

  it('does not fail because of a file that it never reads', async () => {
    const without = writeProject(
      Object.fromEntries(
        Object.entries(common).filter(([path]) => !/modules|lib|nuxt\.config/u.test(path)),
      ),
      {},
      layers,
    );
    const withExtras = writeProject(common, imports, layers);
    chmodSync(join(withExtras, 'layers/web/modules/m.ts'), 0);
    try {
      expect(await check(withExtras)).toEqual(await check(without));
    } finally {
      chmodSync(join(withExtras, 'layers/web/modules/m.ts'), 0o644);
    }
  });
});

describe('a file that cannot be read', () => {
  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')(
    'is recorded as unread and the run goes on',
    async () => {
      const root = writeProject(LIB, LIB_IMPORTS);
      chmodSync(join(root, 'layers/web/lib/libA.ts'), 0);
      try {
        const result = await analyze({ rootDir: root, extraFiles: true });
        expect(result.unreadFiles.map(item => item.reason)).toEqual([
          'Could not read file (EACCES)',
        ]);
      } finally {
        chmodSync(join(root, 'layers/web/lib/libA.ts'), 0o644);
      }
    },
  );
});
