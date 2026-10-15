import { describe, expect, it } from 'vite-plus/test';

import { unusedNames, writeProject } from './unused-extra-project.ts';

const page = (script: string): string =>
  `<script setup lang="ts">\n${script}</script>\n<template><div /></template>\n`;

describe('the uses that unused counts', () => {
  it('counts an explicit import of a file as a use of each export of the file', async () => {
    const root = writeProject(
      {
        'layers/web/app/utils/both.ts': 'export const first = () => 1;\nexport const second = 2;\n',
        'layers/web/app/pages/index.vue': page(
          "import { first } from '../utils/both';\nfirst();\n",
        ),
      },
      { first: 'layers/web/app/utils/both.ts', second: 'layers/web/app/utils/both.ts' },
    );
    expect(await unusedNames(root)).toEqual([]);
  });

  it('counts an import from #imports as a use of that name only', async () => {
    const root = writeProject(
      {
        'layers/web/app/utils/both.ts': 'export const first = () => 1;\nexport const second = 2;\n',
        'layers/web/app/pages/index.vue': page("import { first } from '#imports';\nfirst();\n"),
      },
      { first: 'layers/web/app/utils/both.ts', second: 'layers/web/app/utils/both.ts' },
    );
    expect(await unusedNames(root)).toEqual(['second']);
  });

  it('counts an import from #components as a use of that component', async () => {
    const root = writeProject(
      {
        'layers/web/app/components/UsedCard.vue': '<template><div /></template>\n',
        'layers/web/app/components/IdleCard.vue': '<template><div /></template>\n',
        '.nuxt/components.d.ts': [
          "export const UsedCard: typeof import('../layers/web/app/components/UsedCard.vue')['default']",
          "export const IdleCard: typeof import('../layers/web/app/components/IdleCard.vue')['default']",
          '',
        ].join('\n'),
        'layers/web/app/pages/index.vue': page(
          "import { UsedCard } from '#components';\nconsole.log(UsedCard);\n",
        ),
      },
      {},
    );
    expect(await unusedNames(root)).toEqual(['IdleCard']);
  });
});
