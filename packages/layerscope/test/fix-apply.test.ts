import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import { prepareApply } from '#src/fix/apply.ts';
import { NOT_SCANNED } from '#src/report/moves.ts';

import {
  CART,
  MOVED,
  NEW,
  OLD,
  applyArgs,
  commitAll,
  fixArgs,
  read,
  repoProject,
  shown,
  silence,
} from './fix-apply-project.ts';
import { ADMIN, SHARED, SHOP, WEB, cartProject, checkArgs, plan, write } from './fix-project.ts';
import { git } from './git-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fix flags', () => {
  it('refuses both flags, and --allow-dirty without --apply', async () => {
    const root = repoProject();
    const output = silence();
    expect(await run(fixArgs(root, '--dry-run', '--apply'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('Use --dry-run or --apply, not both.');
    expect(await run(fixArgs(root, '--dry-run', '--allow-dirty'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('--allow-dirty works only with --apply.');
    expect(read(root, CART)).toContain('useCart');
  });

  it('prints the plan with --dry-run, and changes no file', async () => {
    const root = repoProject();
    const output = silence();
    expect(await run(fixArgs(root, '--dry-run'))).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain(`${shown(root, CART)} → ${shown(root, MOVED)}`);
    expect(existsSync(join(root, CART))).toBe(true);
    expect(git(root, 'status', '--porcelain')).toBe('');
  });
});

describe('fix --apply moves', () => {
  it('moves the file with git mv, rewrites the import, and check passes', async () => {
    const root = repoProject();
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_CLEAN);
    expect(existsSync(join(root, CART))).toBe(false);
    expect(read(root, 'layers/admin/app/pages/admin.vue')).toContain(`'${NEW}'`);
    // The move is a rename in the index: git keeps the history of the file.
    expect(git(root, 'status', '--porcelain')).toContain(`R  ${CART} -> ${MOVED}`);
    git(root, 'commit', '-q', '-m', 'move');
    expect(git(root, 'log', '--follow', '--format=%s', '--', MOVED).trim()).toBe('move\nstart');
    expect(output.stdout()).toBe(
      [
        'Moved 1 file, updated 2 imports in 2 files.',
        `  ${shown(root, CART)} → ${shown(root, MOVED)}`,
        NOT_SCANNED,
        'Run `layerscope check --prepare` to see what is left.',
        '',
      ].join('\n'),
    );
    vi.restoreAllMocks();
    silence();
    expect(await run(checkArgs(root))).toBe(EXIT_CLEAN);
  });

  it('prints one line and exits 0 when no move is planned, also on a dirty tree', async () => {
    const root = repoProject();
    write(root, 'layers/admin/app/pages/admin.vue', '<script setup lang="ts">\n</script>\n');
    write(root, 'layers/shop/app/pages/shop.vue', '<script setup lang="ts">\n</script>\n');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_CLEAN);
    expect(output.stdout()).toMatch(/^No file moves suggested\.\n/u);
  });
});

describe('fix --apply plain moves', () => {
  it('moves a file that git does not track with a plain rename, only with --allow-dirty', async () => {
    const root = repoProject();
    git(root, 'rm', '-q', '--cached', CART);
    git(root, 'commit', '-q', '-m', 'untrack');
    write(root, '.gitignore', '.nuxt\n**/composables/\n');
    git(root, 'add', '.gitignore');
    git(root, 'commit', '-q', '-m', 'ignore');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      `${shown(root, CART)} is not tracked by git, so \`git status\` and \`git diff\` would not show a change to it. Add it to git, or use --allow-dirty.`,
    );
    expect(existsSync(join(root, MOVED))).toBe(false);
    vi.restoreAllMocks();
    const second = silence();
    expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_CLEAN);
    expect(existsSync(join(root, MOVED))).toBe(true);
    expect(second.stdout()).toContain(
      `1 file moved without git, so git does not keep its history: ${shown(root, CART)}.`,
    );
  });

  it('lists an import that is not relative to update by hand, and does not write it', async () => {
    const root = repoProject();
    // An absolute specifier is the same case as an alias: layerscope does not rewrite it.
    const absolute = `${root}/layers/web/app/composables/useCart`;
    write(root, 'layers/shop/app/utils/abs.ts', `export { useCart } from '${absolute}';\n`);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'absolute');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain(
      `Update by hand: layerscope does not change imports that use an alias.\n  ${shown(root, 'layers/shop/app/utils/abs.ts')}:1:25  "${absolute}"`,
    );
    expect(read(root, 'layers/shop/app/utils/abs.ts')).toContain(absolute);
  });
});

describe('fix --apply dirty tree', () => {
  it('refuses a tree with a changed file, and changes nothing', async () => {
    const root = repoProject();
    write(root, 'layers/web/app/composables/other.ts', 'export const other = 1;\n');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('Nothing was changed. fix --apply cannot run:');
    expect(output.stderr()).toContain(
      'The git working tree of the repository has changes or untracked files (1 file). Commit them, stash them with `git stash -u`, or remove them, so that `git status` and `git diff` show only the changes of `--apply`. Or use --allow-dirty.',
    );
    expect(existsSync(join(root, CART))).toBe(true);
    expect(read(root, 'layers/admin/app/pages/admin.vue')).toContain(`'${OLD}'`);
  });

  it('refuses a modified file that git tracks', async () => {
    const root = repoProject();
    write(
      root,
      'layers/shop/app/pages/shop.vue',
      `${read(root, 'layers/shop/app/pages/shop.vue')}\n`,
    );
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('has changes or untracked files (1 file)');
  });
});

describe('fix --apply scope of the tree', () => {
  it('refuses a change in another dir of the repository, when the project is a subdir', async () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-apply-')));
    const root = join(repo, 'apps/web');
    mkdirSync(root, { recursive: true });
    const source = cartProject([WEB, SHARED, ADMIN, SHOP]);
    // The same project, one dir down.
    cpSync(source, root, { recursive: true });
    write(repo, 'apps/other/a.ts', 'export const a = 1;\n');
    commitAll(repo);
    write(repo, 'apps/other/a.ts', 'export const a = 2;\n');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      'The git working tree of the repository has changes or untracked files (1 file)',
    );
    expect(existsSync(join(root, CART))).toBe(true);
    // Without the change, the project in the subdir moves, with git mv.
    git(repo, 'checkout', '-q', '.');
    vi.restoreAllMocks();
    silence();
    expect(await run(applyArgs(root))).toBe(EXIT_CLEAN);
    expect(git(repo, 'status', '--porcelain')).toContain('R  apps/web/layers/web/');
  });
});

describe('fix --apply refusals', () => {
  it('refuses a project that is not in git, and --allow-dirty moves it', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('is not in a git repository. Put the project in git');
    expect(existsSync(join(root, CART))).toBe(true);
    vi.restoreAllMocks();
    const second = silence();
    expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_CLEAN);
    expect(existsSync(join(root, MOVED))).toBe(true);
    expect(second.stdout()).toContain('moved without git');
  });
});

describe('fix --apply target and plan', () => {
  it('refuses a move to a path that exists, also a broken link, and lists all reasons', async () => {
    const root = repoProject();
    const prepared = await plan(root);
    expect(prepared).toHaveLength(1);
    write(root, MOVED, 'export const other = 1;\n');
    expect(() => prepareApply(prepared, root, { allowDirty: false, cwd: process.cwd() })).toThrow(
      /has changes or untracked files \(1 file\)[\s\S]*exists, so/u,
    );
    // A link that points nowhere is a path that exists too.
    const other = repoProject();
    const moves = await plan(other);
    mkdirSync(join(other, 'layers/shared/app/composables'), { recursive: true });
    symlinkSync('missing', join(other, MOVED));
    expect(() => prepareApply(moves, other, { allowDirty: true, cwd: process.cwd() })).toThrow(
      `${shown(other, MOVED)} exists, so ${shown(other, CART)} cannot move there.`,
    );
  });
});

describe('fix --apply stale plan', () => {
  it('refuses when the line of the plan changed', async () => {
    const root = repoProject();
    const moves = await plan(root);
    write(
      root,
      'layers/admin/app/pages/admin.vue',
      '<script setup lang="ts">\n// edited\n</script>\n',
    );
    expect(() => prepareApply(moves, root, { allowDirty: true, cwd: process.cwd() })).toThrow(
      `${shown(root, 'layers/admin/app/pages/admin.vue')}:2 does not have "${OLD}" now. Run the command again.`,
    );
  });

  it('refuses a source that is gone', async () => {
    const root = repoProject();
    const moves = await plan(root);
    git(root, 'rm', '-q', '-f', CART);
    expect(() => prepareApply(moves, root, { allowDirty: true, cwd: process.cwd() })).toThrow(
      `${shown(root, CART)} is not a file now. Run the command again.`,
    );
  });

  it('refuses two moves with the same target', async () => {
    const root = repoProject();
    const [move] = await plan(root);
    const other = { ...move, from: join(root, 'layers/shared/app/utils/noop.ts') };
    expect(() =>
      prepareApply([move, other], root, { allowDirty: true, cwd: process.cwd() }),
    ).toThrow(`Two moves have the same target: ${shown(root, MOVED)}.`);
  });
});
