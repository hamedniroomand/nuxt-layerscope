import { relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';

import { writeProject } from './unused-extra-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const PAGE = `<script setup lang="ts">
import type { Info } from '../../../base/app/utils/info';
import { type Pair, pairUtil } from '../../../base/app/utils/pair';
type Result = ReturnType<typeof useThing>;
type Other = typeof unknownName;
const value: Result | Other | Info | Pair | null = null;
pairUtil();
void value;
</script>
<template><div /></template>
`;

const FILES = {
  'layers/base/app/utils/info.ts': 'export interface Info { a: number }\n',
  'layers/base/app/utils/pair.ts':
    'export interface Pair { a: number }\nexport const pairUtil = () => 1;\n',
  'layers/base/app/composables/useThing.ts': 'export const useThing = () => 1;\n',
  'layers/web/app/pages/index.vue': PAGE,
};

const IMPORTS = {
  useThing: 'layers/base/app/composables/useThing.ts',
  pairUtil: 'layers/base/app/utils/pair.ts',
};

async function cli(
  command: string,
  typeImports: 'check' | 'ignore',
  ...args: string[]
): Promise<string> {
  const root = writeProject(
    FILES,
    IMPORTS,
    `{ typeImports: '${typeImports}', layers: { web: { path: 'layers/web', allow: [] }, base: { path: 'layers/base' } } }`,
  );
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  out.mockClear();
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', command, root, ...args]);
  const text = out.mock.calls.map(call => String(call[0])).join('');
  // The report prints paths relative to the current dir.
  return `exit ${code}\n${text.replaceAll(relative(process.cwd(), root), '<root>').replaceAll(root, '<root>')}`;
}

const check = async (typeImports: 'check' | 'ignore', ...args: string[]): Promise<string> => {
  const text = await cli('check', typeImports, ...args);
  return text;
};

/** The output of `check` for type positions, captured before `unused` counted them. */
describe('check output with typeof and type-only imports (golden)', () => {
  it("typeImports 'check', text", async () => {
    await expect(await check('check')).toMatchFileSnapshot('snapshots/type-uses-check-text.txt');
  });

  it("typeImports 'check', json", async () => {
    await expect(await check('check', '--format', 'json')).toMatchFileSnapshot(
      'snapshots/type-uses-check-json.txt',
    );
  });

  it("typeImports 'ignore', text", async () => {
    await expect(await check('ignore')).toMatchFileSnapshot('snapshots/type-uses-ignore-text.txt');
  });

  it("typeImports 'ignore', json", async () => {
    await expect(await check('ignore', '--format', 'json')).toMatchFileSnapshot(
      'snapshots/type-uses-ignore-json.txt',
    );
  });
});

describe('SARIF and graph output with typeof and type-only imports (golden)', () => {
  for (const typeImports of ['check', 'ignore'] as const) {
    it(`typeImports '${typeImports}', sarif`, async () => {
      await expect(await check(typeImports, '--format', 'sarif')).toMatchFileSnapshot(
        `snapshots/type-uses-${typeImports}-sarif.txt`,
      );
    });

    it(`typeImports '${typeImports}', graph json`, async () => {
      await expect(await cli('graph', typeImports, '--format', 'json')).toMatchFileSnapshot(
        `snapshots/type-uses-${typeImports}-graph.txt`,
      );
    });
  }
});
