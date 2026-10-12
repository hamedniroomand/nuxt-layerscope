import { rmSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { createBaseline, writeBaseline } from '#src/baseline/index.ts';

import { tempDir, write } from './watch-project.ts';

const USE = "import { value } from '../../shop/app/value';\nexport const total = value;\n";

/** `auth` and `shop` use each other, so they form a cycle. Both are allowed, so there is no other finding. */
function project(): string {
  const root = tempDir();
  write(root, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(
    root,
    'layerscope.config.mjs',
    "export default { layers: { auth: { path: 'layers/auth', allow: ['shop'] }, shop: { path: 'layers/shop', allow: ['auth'] } }, rules: { 'layer-cycle': 'error' } };\n",
  );
  write(root, 'layers/shop/app/value.ts', "import '../../auth/app/Z';\nexport const value = 1;\n");
  write(root, 'layers/auth/app/AccountMenu.ts', USE);
  write(root, 'layers/auth/app/Z.ts', USE);
  return root;
}

async function cyclesWithBaseline(root: string): Promise<string[]> {
  const result = await analyze({ rootDir: root, baseline: 'layerscope-baseline.json' });
  return result.findings
    .filter(finding => finding.rule === 'layer-cycle')
    .map(finding => finding.file);
}

describe('check with a baselined layer cycle', () => {
  async function baselined(): Promise<string> {
    const root = project();
    const first = await analyze({ rootDir: root });
    expect(first.findings.filter(finding => finding.rule === 'layer-cycle')).toHaveLength(1);
    writeBaseline(join(root, 'layerscope-baseline.json'), createBaseline(first.findings, root));
    return root;
  }

  it('accepts the cycle', async () => {
    expect(await cyclesWithBaseline(await baselined())).toEqual([]);
  });

  it('accepts it after the file of the first use is deleted', async () => {
    const root = await baselined();
    rmSync(join(root, 'layers/auth/app/AccountMenu.ts'));
    expect(await cyclesWithBaseline(root)).toEqual([]);
  });

  it('accepts it after an earlier file gets a new use', async () => {
    const root = await baselined();
    write(root, 'layers/auth/app/Aaa.ts', USE);
    expect(await cyclesWithBaseline(root)).toEqual([]);
  });
});
