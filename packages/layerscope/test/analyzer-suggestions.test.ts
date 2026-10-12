import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { Analyzer } from '#src/devtools/analyzer.ts';
import { allowHint } from '#src/devtools/hints.ts';

import { empty, page, write } from './fix-project.ts';

/** admin uses useCart of web in two files, and may not. */
function project(): string {
  const root = empty(
    ["web: { path: 'layers/web', allow: [] }", "admin: { path: 'layers/admin', allow: [] }"].join(
      ',\n',
    ),
  );
  write(root, 'layers/web/app/composables/useCart.ts', 'export const useCart = () => 1;\n');
  for (const name of ['a', 'b']) {
    write(
      root,
      `layers/admin/app/pages/${name}.vue`,
      page("import { useCart } from '../../../web/app/composables/useCart';", 'useCart();'),
    );
  }
  return root;
}

const ENTRY = {
  rule: 'layer-boundary',
  file: 'layers/admin/app/pages/a.vue',
  symbol: '../../../web/app/composables/useCart',
  toLayer: 'web',
};

function writeBaseline(root: string, entries: unknown[]): void {
  writeFileSync(join(root, 'b.json'), JSON.stringify({ version: 1, entries }));
}

describe('accepted findings', () => {
  it('have no suggestion, and the shown findings count only the shown ones', async () => {
    const root = project();
    writeBaseline(root, [ENTRY]);
    const result = await analyze({ rootDir: root, baseline: 'b.json' });
    const [shown] = result.findings;
    const [accepted] = result.baseline?.suppressed ?? [];
    expect(shown.suggestion?.message).toContain('clears 1 finding)');
    expect(accepted.suggestion).toBeUndefined();
  });
});

describe('Analyzer rebaseline: suggestions', () => {
  it('makes the suggestions again, so the counts and the hint follow the new baseline', async () => {
    const root = project();
    writeBaseline(root, [ENTRY]);
    const analyzer = new Analyzer({ rootDir: root, baseline: 'b.json', envKey: (): string => 'k' });
    const before = await analyzer.get();
    expect(before.result.findings).toHaveLength(1);
    expect(allowHint(before.result.findings[0], before.result)).toMatchObject({
      resolves: 1,
      files: 1,
      baselined: 1,
    });
    writeBaseline(root, []);
    const after = await analyzer.rebaseline();
    expect(after.result.findings).toHaveLength(2);
    for (const finding of after.result.findings) {
      expect(finding.suggestion?.message).toContain('clears 2 findings)');
    }
    expect(allowHint(after.result.findings[0], after.result)).toMatchObject({
      resolves: 2,
      files: 2,
      baselined: 0,
    });
    writeBaseline(root, [ENTRY]);
    const again = await analyzer.rebaseline();
    // The finding that was shown a moment ago is accepted now, and its suggestion is gone.
    const [accepted] = again.result.baseline?.suppressed ?? [];
    expect(accepted.suggestion).toBeUndefined();
    expect(again.result.findings[0].suggestion?.message).toContain('clears 1 finding)');
  });
});
