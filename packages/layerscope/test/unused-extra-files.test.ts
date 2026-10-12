import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { findBlindSpots } from '#src/unused/blind-spots.ts';

import type { Files } from './unused-extra-project.ts';
import { LIB, LIB_IMPORTS, unusedNames, write, writeProject } from './unused-extra-project.ts';

describe('unused reads nuxt.config.* and local modules (case 1)', () => {
  const imports = {
    LOCALES: 'layers/web/shared/utils/locales.ts',
    formatThing: 'layers/web/app/utils/formatThing.ts',
  };
  const base: Files = {
    'layers/web/shared/utils/locales.ts': 'export const LOCALES = ["en"];\n',
    'layers/web/app/utils/formatThing.ts': 'export const formatThing = () => "";\n',
  };

  it('lists a symbol that nothing imports', async () => {
    const root = writeProject(base, imports);
    expect(await unusedNames(root)).toEqual(['formatThing', 'LOCALES']);
  });

  it('counts an import in the nuxt.config.ts of a layer', async () => {
    const root = writeProject(
      {
        ...base,
        'layers/web/nuxt.config.ts':
          "import { LOCALES } from './shared/utils/locales';\nexport default { i18n: LOCALES };\n",
      },
      imports,
    );
    expect(await unusedNames(root)).toEqual(['formatThing']);
  });

  it('counts an import in .config/nuxt.config.ts', async () => {
    const root = writeProject(
      {
        ...base,
        'layers/web/.config/nuxt.config.ts':
          "import { LOCALES } from '../shared/utils/locales';\nexport default { i18n: LOCALES };\n",
      },
      imports,
    );
    expect(await unusedNames(root)).toEqual(['formatThing']);
  });
});

describe('unused reads local modules and bad config files (case 1)', () => {
  const imports = {
    LOCALES: 'layers/web/shared/utils/locales.ts',
    formatThing: 'layers/web/app/utils/formatThing.ts',
  };
  const base: Files = {
    'layers/web/shared/utils/locales.ts': 'export const LOCALES = ["en"];\n',
    'layers/web/app/utils/formatThing.ts': 'export const formatThing = () => "";\n',
  };

  it('counts an import in a local module', async () => {
    const root = writeProject(
      {
        ...base,
        'layers/web/modules/my-module.ts':
          "import { formatThing } from '../app/utils/formatThing';\nexport default () => formatThing();\n",
      },
      imports,
    );
    expect(await unusedNames(root)).toEqual(['LOCALES']);
  });

  it('names a nuxt.config.ts that does not parse', async () => {
    const root = writeProject(
      { ...base, 'layers/web/nuxt.config.ts': 'export default = ;\n' },
      imports,
    );
    const result = await analyze({ rootDir: root, extraFiles: true });
    expect(result.unreadFiles.map(item => item.reason)).toEqual(['Could not parse file']);
    expect(findBlindSpots(result).map(spot => spot.kind)).toContain('unreadable');
  });
});

describe('unused reads extra auto-import dirs (case 2)', () => {
  const imports = LIB_IMPORTS;
  const lib = LIB;

  it('counts a use inside a file of the extra dir', async () => {
    const root = writeProject(lib, imports);
    expect(await unusedNames(root)).toEqual(['libA']);
  });
});

describe('unused follows imports outside the source dirs (case 2)', () => {
  const imports = LIB_IMPORTS;
  const lib = LIB;

  it('follows an import of a helper that registers nothing', async () => {
    const root = writeProject(
      {
        'layers/web/lib/libA.ts':
          "import { help } from './sub/helper';\nexport const libA = () => help();\n",
        'layers/web/lib/libB.ts': 'export const libB = () => 1;\n',
        'layers/web/lib/sub/helper.ts': 'export const help = () => libB();\n',
      },
      imports,
    );
    expect(await unusedNames(root)).toEqual(['libA']);
  });

  it('follows an import of a file outside the source dirs from a scanned file', async () => {
    const root = writeProject(
      {
        ...lib,
        'layers/web/app/pages/index.vue':
          '<script setup lang="ts">\nimport { tool } from \'../../tools/tool\';\ntool();\n</script>\n<template><div /></template>\n',
        'layers/web/tools/tool.ts': 'export const tool = () => libA();\n',
      },
      imports,
    );
    expect(await unusedNames(root)).toEqual([]);
  });
});

describe('unused skips test and ignored files (case 2)', () => {
  it('does not read a test file or an ignored file that a counted file imports', async () => {
    const root = writeProject(
      {
        ...LIB,
        'layers/web/lib/libA.ts':
          "import './libB.test';\nimport '../app/legacy/uses';\nexport const libA = () => 1;\n",
        'layers/web/lib/libB.test.ts': 'libC();\n',
        'layers/web/app/legacy/uses.ts': 'libD();\n',
        'layers/web/modules/x.test.ts': 'libE();\n',
      },
      {
        ...LIB_IMPORTS,
        libC: 'layers/web/lib/libC.ts',
        libD: 'layers/web/lib/libD.ts',
        libE: 'layers/web/lib/libE.ts',
      },
      "{ layers: { web: { path: 'layers/web' } }, ignore: ['legacy/**'] }",
    );
    for (const name of ['libC', 'libD', 'libE']) {
      write(root, `layers/web/lib/${name}.ts`, `export const ${name} = () => 1;\n`);
    }
    expect(await unusedNames(root)).toEqual(['libA', 'libB', 'libC', 'libD', 'libE']);
  });
});

describe('unused finds uses in any context (extra files)', () => {
  const server = { sa: 'layers/web/srvlib/sa.ts', sb: 'layers/web/srvlib/sb.ts' };

  it('finds a server auto-import in a nitro imports.dirs file', async () => {
    const root = writeProject(
      {
        'layers/web/srvlib/sa.ts': 'export const sa = () => sb();\n',
        'layers/web/srvlib/sb.ts': 'export const sb = () => 1;\n',
      },
      {},
      undefined,
      server,
    );
    expect(await unusedNames(root)).toEqual(['sa']);
  });

  it('finds a server auto-import in a file that a server file imports', async () => {
    const root = writeProject(
      {
        'layers/web/server/api/x.ts':
          "import { t } from '../../tools/t';\nexport default () => t();\n",
        'layers/web/tools/t.ts': 'export const t = () => serverHelper();\n',
        'layers/web/server/utils/serverHelper.ts': 'export const serverHelper = () => 1;\n',
      },
      {},
      undefined,
      { serverHelper: 'layers/web/server/utils/serverHelper.ts' },
    );
    expect(await unusedNames(root)).toEqual([]);
  });

  it('gives no unresolved-reference finding for an extra file', async () => {
    const root = writeProject(
      { ...LIB, 'layers/web/lib/libA.ts': 'export const libA = () => nowhere();\n' },
      LIB_IMPORTS,
    );
    const result = await analyze({ rootDir: root, extraFiles: true });
    expect(result.findings.filter(finding => finding.rule === 'unresolved-reference')).toEqual([]);
  });
});
