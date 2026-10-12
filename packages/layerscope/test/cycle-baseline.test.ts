import { rmSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { removeEntries } from '#src/baseline/edit.ts';
import { createBaseline, surplusKeyOf, writeBaseline } from '#src/baseline/index.ts';

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

describe('removing the surplus of a merged cycle entry', () => {
  it('keeps the entry that the live cycle uses', async () => {
    const root = project();
    const [cycle] = (await analyze({ rootDir: root })).findings;
    const file = join(root, 'layerscope-baseline.json');
    const entry = { rule: 'layer-cycle', symbol: cycle.symbol, toLayer: cycle.toLayer };
    // An older baseline names the cycle in two files, which is a count of 2.
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        entries: [
          { ...entry, file: 'old.vue' },
          { ...entry, file: 'older.vue' },
        ],
      }),
    );
    const before = await analyze({ rootDir: root, baseline: 'layerscope-baseline.json' });
    expect(before.baseline?.suppressed).toHaveLength(1);
    const surplus = before.baseline?.removable ?? [];
    expect(surplus).toHaveLength(1);
    removeEntries(
      file,
      surplus.map(item => surplusKeyOf(item)),
      new Map(surplus.map(item => [surplusKeyOf(item), item.count ?? 1])),
    );
    const after = await analyze({ rootDir: root, baseline: 'layerscope-baseline.json' });
    expect(after.findings.filter(finding => finding.rule === 'layer-cycle')).toEqual([]);
    expect(after.baseline?.suppressed).toHaveLength(1);
    expect(after.baseline?.removable).toEqual([]);
  });
});
