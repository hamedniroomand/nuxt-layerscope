import { readFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, run } from '#src/cli.ts';

import {
  ADMIN,
  SHARED,
  SHOP,
  WEB,
  applyPlan,
  cartProject,
  page,
  plan,
  write,
} from './fix-project.ts';

const OLD = '../../../web/app/composables/useCart';

afterEach(() => {
  vi.restoreAllMocks();
});

function project(): string {
  const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
  write(
    root,
    'layers/admin/app/pages/admin.vue',
    page(
      `import type { useCart as Cart } from '${OLD}';`,
      `import { useCart } from '${OLD}';`,
      'useCart();',
    ),
  );
  return root;
}

describe('imports of one file that a file has more than once', () => {
  it('plans an update for each import', async () => {
    const root = project();
    const read = readFileSync(join(root, 'layers/admin/app/pages/admin.vue'), 'utf8');
    const [move] = await plan(root);
    const admin = move.updates.filter(update => update.file.endsWith('admin.vue'));
    expect(admin.map(update => update.line)).toEqual([2, 3]);
    // The column is the place of the opening quote, counted from 1.
    const lines = read.split('\n');
    expect(admin.map(update => update.column)).toEqual(
      admin.map(update => lines[update.line - 1].indexOf("'") + 1),
    );
    expect(move.updates).toHaveLength(3);
  });

  it('counts each import in the suggestion, and keeps one finding for each file', async () => {
    const root = project();
    const result = await analyze({ rootDir: root });
    const admin = result.findings.filter(finding => finding.file.endsWith('admin.vue'));
    expect(admin).toHaveLength(1);
    expect(admin[0].suggestion?.impact.imports).toBe(3);
  });
});

describe('applying the plan of a file with repeated imports', () => {
  it('applies the plan, so that no import is left unresolved', async () => {
    const root = project();
    await applyPlan(root);
    const result = await analyze({ rootDir: root });
    // `unresolved-reference` is a warning by default, so `check` would still exit 0.
    expect(result.findings.filter(finding => finding.rule === 'unresolved-reference')).toEqual([]);
    expect(readFileSync(join(root, 'layers/admin/app/pages/admin.vue'), 'utf8')).not.toContain(OLD);
  });

  it('shows the column of each import, also for two imports on one line', async () => {
    const root = project();
    write(
      root,
      'layers/admin/app/pages/admin.vue',
      page(
        `import { useCart as a } from '${OLD}'; import { useCart as b } from '${OLD}';`,
        'a(); b();',
      ),
    );
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(await run(['node', 'layerscope', 'fix', root, '--dry-run'])).toBe(EXIT_CLEAN);
    const text = output.mock.calls.map(call => String(call[0])).join('');
    const rows = text.split('\n').filter(row => row.includes('admin.vue:'));
    expect(rows).toHaveLength(2);
    expect(new Set(rows).size).toBe(2);
    expect(rows[0]).toMatch(/admin\.vue:2:\d+ /u);
  });
});
