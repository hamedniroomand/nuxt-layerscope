import { relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { findUnused } from '#src/unused/index.ts';

import { writeProject } from './unused-extra-project.ts';

const SHARED = { sharedLabel: 'layers/web/shared/utils/sharedLabel.ts' };
const SHARED_FILES = {
  'layers/web/shared/utils/sharedLabel.ts': 'export const sharedLabel = () => 1;\n',
};

async function rows(root: string): Promise<[string, string | null, boolean, string][]> {
  const result = await analyze({ rootDir: root });
  return findUnused(result).map(symbol => [
    symbol.name,
    symbol.context,
    symbol.exposed,
    relative(root, symbol.file),
  ]);
}

describe('the context of an unused auto-import', () => {
  it('is shared for a file in shared/, when the shared imports come from both contexts', async () => {
    const root = writeProject(SHARED_FILES, SHARED, undefined, SHARED);
    expect(await rows(root)).toEqual([
      ['sharedLabel', 'shared', false, 'layers/web/shared/utils/sharedLabel.ts'],
    ]);
  });

  it('is shared for a file in shared/, when Nuxt writes shared-imports.d.ts', async () => {
    const root = writeProject(
      {
        ...SHARED_FILES,
        '.nuxt/types/shared-imports.d.ts':
          "declare global {\n  const sharedLabel: typeof import('../../layers/web/shared/utils/sharedLabel.ts').sharedLabel\n}\nexport {}\n",
      },
      SHARED,
      undefined,
      {},
    );
    expect((await rows(root)).map(([name, context]) => [name, context])).toEqual([
      ['sharedLabel', 'shared'],
    ]);
  });

  it('is server for a file outside server/ that only Nitro registers', async () => {
    const root = writeProject(
      { 'layers/web/lib/serverOnly.ts': 'export const serverOnly = () => 1;\n' },
      {},
      undefined,
      { serverOnly: 'layers/web/lib/serverOnly.ts' },
    );
    expect((await rows(root)).map(([name, context]) => [name, context])).toEqual([
      ['serverOnly', 'server'],
    ]);
  });
});

describe('an unused symbol in expose', () => {
  it('is marked as exposed', async () => {
    const root = writeProject(
      {
        'layers/web/app/utils/kept.ts': 'export const kept = () => 1;\n',
        'layers/web/app/utils/open.ts': 'export const open = () => 1;\n',
      },
      { kept: 'layers/web/app/utils/kept.ts', open: 'layers/web/app/utils/open.ts' },
      "{ layers: { web: { path: 'layers/web', expose: ['open'] } } }",
    );
    expect((await rows(root)).map(([name, context, exposed]) => [name, context, exposed])).toEqual([
      ['kept', 'app', false],
      ['open', 'app', true],
    ]);
  });
});
