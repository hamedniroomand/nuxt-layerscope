import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { writeSnapshot } from '#src/devtools/static.ts';

import { LIB, LIB_IMPORTS, unusedNames, writeProject } from './unused-extra-project.ts';

describe('a name that is an auto-import in two contexts', () => {
  it('counts each one when an extra file calls it', async () => {
    const root = writeProject(
      {
        'layers/web/lib/fmt.ts': 'export const fmt = () => 1;\n',
        'layers/web/server/utils/fmt.ts': 'export const fmt = () => 2;\n',
        'layers/web/server/api/x.ts':
          "import { t } from '../../tools/t';\nexport default () => t();\n",
        'layers/web/tools/t.ts': 'export const t = () => fmt();\n',
      },
      { fmt: 'layers/web/lib/fmt.ts' },
      undefined,
      { fmt: 'layers/web/server/utils/fmt.ts' },
    );
    expect(await unusedNames(root)).toEqual([]);
  });
});

describe('the static DevTools snapshot', () => {
  it('counts the uses in nuxt.config.ts and in extra dirs, like the CLI', async () => {
    const root = writeProject(
      {
        ...LIB,
        'layers/web/shared/utils/locales.ts': 'export const LOCALES = [];\n',
        'layers/web/nuxt.config.ts':
          "import { LOCALES } from './shared/utils/locales';\nexport default { LOCALES };\n",
      },
      { ...LIB_IMPORTS, LOCALES: 'layers/web/shared/utils/locales.ts' },
    );
    const publicDir = mkdtempSync(join(tmpdir(), 'layerscope-static-extra-'));
    const assetsDir = mkdtempSync(join(tmpdir(), 'layerscope-client-extra-'));
    writeFileSync(join(assetsDir, 'client.js'), '/* client */\n');
    try {
      await writeSnapshot({ rootDir: root, publicDir, base: '/__layerscope', assetsDir });
      const body = JSON.parse(
        readFileSync(join(publicDir, '__layerscope/api/unused.json'), 'utf8'),
      ) as { unused: { name: string }[] };
      expect(body.unused.map(row => row.name)).toEqual(['libA']);
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
      rmSync(assetsDir, { recursive: true, force: true });
    }
  });
});
