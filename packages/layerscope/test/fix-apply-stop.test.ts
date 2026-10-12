import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { prepareApply, realIo, runApply } from '#src/fix/apply.ts';
import { formatStopped } from '#src/report/applied.ts';

import { CART, MOVED, read, repoProject, shown } from './fix-apply-project.ts';
import { cartProject, plan, WEB, SHARED, ADMIN, SHOP } from './fix-project.ts';
import { git } from './git-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const SEE = 'Run `git status` and `git diff` to see the changes. Use git to undo them.';
const MISS =
  'With --allow-dirty, git can show changes from before --apply, and it can miss some changes of --apply. The lists above show what --apply changed.';
const cwd = (): string => process.cwd();

function failingMove(root: string): ReturnType<typeof realIo> {
  return {
    ...realIo(root),
    move: () => {
      throw new Error('disk full');
    },
  };
}

describe('fix --apply stops half way', () => {
  it('prints the reason, what is done and what is not, and how to see the changes', async () => {
    const root = repoProject();
    const prepared = prepareApply(await plan(root), root, { allowDirty: false, cwd: cwd() });
    const result = runApply(prepared, failingMove(root));
    expect(result.failure).toBe('disk full');
    expect(formatStopped(result, prepared, cwd())).toBe(
      [
        'fix --apply stopped: disk full',
        'Done:',
        `  updated ${shown(root, 'layers/admin/app/pages/admin.vue')}`,
        `  updated ${shown(root, 'layers/shop/app/pages/shop.vue')}`,
        'Not done:',
        `  moved ${shown(root, CART)} → ${shown(root, MOVED)}`,
        SEE,
        '',
      ].join('\n'),
    );
  });

  it('shows exactly the done steps in git status, because the tree was clean before', async () => {
    const root = repoProject();
    const prepared = prepareApply(await plan(root), root, { allowDirty: false, cwd: cwd() });
    runApply(prepared, failingMove(root));
    // The two importers are edited, and the file is not moved.
    expect(git(root, 'status', '--porcelain').split('\n').filter(Boolean).toSorted()).toEqual([
      ' M layers/admin/app/pages/admin.vue',
      ' M layers/shop/app/pages/shop.vue',
    ]);
    expect(read(root, CART)).toContain('useCart');
  });
});

describe('fix --apply stops half way, and git can miss changes', () => {
  it('says that git can show older changes and miss some, with --allow-dirty', async () => {
    const root = repoProject();
    const prepared = prepareApply(await plan(root), root, { allowDirty: true, cwd: cwd() });
    const result = runApply(prepared, {
      ...realIo(root),
      write: () => {
        throw new Error('read-only');
      },
    });
    const text = formatStopped(result, prepared, cwd());
    expect(text).toContain('Done:\n  nothing\n');
    expect(text).toContain(`${MISS}\n${SEE}\n`);
  });

  it('says that the lists are the only record when the project is not in git', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    const prepared = prepareApply(await plan(root), root, { allowDirty: true, cwd: cwd() });
    const result = runApply(prepared, failingMove(root));
    const text = formatStopped(result, prepared, cwd());
    expect(text).toContain(
      'The project is not in git, so the lists above are the only record of the changes.\n',
    );
    expect(text).not.toContain('git status');
  });
});
