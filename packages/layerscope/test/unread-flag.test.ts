import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { propose } from '#src/init/index.ts';
import { formatInit } from '#src/report/init.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { needsPrepareHint } from '#src/watch/project.ts';

import { project } from './unread-project.ts';
import { write } from './watch-project.ts';

async function analyzeApp(files: Record<string, string>): Promise<AnalyzeResult> {
  const root = project();
  for (const [path, content] of Object.entries(files)) {
    write(root, join('layers/admin/app', path), content);
  }
  const result = await analyze({ rootDir: root, source: 'types' });
  return result;
}

describe('the unread flag of a finding', () => {
  it('is `true` on code that layerscope cannot read, and on no other finding', async () => {
    const result = await analyzeApp({
      'composables/useLoad.ts': 'export const load = (a: string) => [import(a), useX()];\n',
    });
    expect(result.findings.map(finding => [finding.symbol, finding.unread])).toEqual([
      ['import()', true],
      ['useX', undefined],
    ]);
  });

  it('keeps `nuxi prepare` out of the hint for code that cannot be read, but not for a free name', async () => {
    const files = {
      'composables/useImport.ts': 'export const load = (a: string) => import(a);\n',
      'composables/useRequire.ts': 'export const load = (a: string) => require(a);\n',
      'composables/useGlob.ts': "export const all = import.meta.glob('./*.ts');\n",
      'pages/Pug.vue': '<template lang="pug">\ndiv\n</template>\n',
      'pages/Src.vue': '<template src="./x.html"></template>\n',
      'pages/Parse.vue':
        '<script setup>\nconst bar = 1\n</script>\n<template>{{ bar! }}</template>\n',
      'pages/Load.vue':
        '<template>\n  <button @click="() => import(`./${name}`)" />\n</template>\n',
    };
    const result = await analyzeApp(files);
    // Each file gives an unread finding, so a producer without the flag makes the hint true.
    const unread = result.findings.filter(finding => finding.unread === true);
    expect(new Set(unread.map(finding => finding.file.split('/').at(-1))).size).toBe(
      Object.keys(files).length,
    );
    expect(needsPrepareHint(result.findings)).toBe(false);
    const free = await analyzeApp({ ...files, 'composables/useFree.ts': 'useX();\n' });
    expect(needsPrepareHint(free.findings)).toBe(true);
  });
});

describe('the readiness report of init', () => {
  async function report(files: Record<string, string>): Promise<string> {
    const result = await analyzeApp(files);
    const proposal = propose(result);
    const options = { source: '', written: false, configFile: 'c', baselineFile: null };
    return [JSON.stringify(proposal.readiness), formatInit(result, proposal, options)].join('\n');
  }

  it('counts code that it cannot read apart from unresolved references', async () => {
    const text = await report({
      'composables/useA.ts': "export const a = import.meta.glob('./a/*.ts');\n",
      'utils/b.ts': "export const b = import.meta.glob('./b/*.ts');\n",
      'plugins/c.ts': "export const c = import.meta.glob('./c/*.ts');\n",
    });
    expect(text).toContain('"unresolved":0,"unread":3,"byLayer":[],"byDirectory":[]');
    expect(text).toContain('  All 0 references resolved.\n  Could not read the code in 3 places.');
    expect(text).not.toContain('By directory');
  });

  it('shows the count after the unresolved references, and says "1 place"', async () => {
    const text = await report({
      'composables/useA.ts': "export const a = [import.meta.glob('./a/*.ts'), useX()];\n",
    });
    expect(text).toContain('"unresolved":1,"unread":1,');
    expect(text).toContain(
      '  1 of 1 reference could not be resolved (100%).\n  Could not read the code in 1 place. Uses there are not checked.',
    );
  });
});
