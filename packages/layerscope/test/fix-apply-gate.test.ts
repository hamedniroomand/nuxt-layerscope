import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import { prepareApply, realIo, runApply } from '#src/fix/apply.ts';
import { formatStopped } from '#src/report/applied.ts';

import {
  CART,
  MOVED,
  OLD,
  applyArgs,
  read,
  repoProject,
  shown,
  silence,
} from './fix-apply-project.ts';
import { ADMIN, SHARED, SHOP, WEB, cartProject, plan, write } from './fix-project.ts';
import { git } from './git-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const ADMIN_PAGE = 'layers/admin/app/pages/admin.vue';
const cwd = (): string => process.cwd();

/** Stops tracking the file and ignores it, as a repository that ignores generated files does. */
function ignore(root: string, path: string): void {
  git(root, 'rm', '-q', '--cached', path);
  write(root, '.gitignore', `.nuxt\n${path}\n`);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'ignore');
}

describe('fix --apply and files that git does not track', () => {
  it('refuses a source file that git ignores, so that git status would not show it', async () => {
    const root = repoProject();
    ignore(root, CART);
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      `${shown(root, CART)} is not tracked by git, so \`git status\` and \`git diff\` would not show a change to it. Add it to git, or use --allow-dirty.`,
    );
    expect(existsSync(join(root, MOVED))).toBe(false);
    expect(read(root, ADMIN_PAGE)).toContain(`'${OLD}'`);
  });

  it('refuses an importer that git ignores, and changes nothing', async () => {
    const root = repoProject();
    ignore(root, ADMIN_PAGE);
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(`${shown(root, ADMIN_PAGE)} is not tracked by git`);
    expect(existsSync(join(root, CART))).toBe(true);
  });

  it('refuses a project in a dir that the outer repository ignores', async () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-outer-')));
    const root = join(repo, 'apps/web');
    mkdirSync(root, { recursive: true });
    cpSync(cartProject([WEB, SHARED, ADMIN, SHOP]), root, { recursive: true });
    write(repo, '.gitignore', 'apps/web/\n');
    write(repo, 'README.md', 'outer\n');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'start');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('is not tracked by git');
    expect(existsSync(join(root, CART))).toBe(true);
  });
});

describe('fix --apply with --allow-dirty and files that git does not track', () => {
  it('moves it with --allow-dirty, and a stop says that git can miss changes', async () => {
    const root = repoProject();
    ignore(root, CART);
    const prepared = prepareApply(await plan(root), root, { allowDirty: true, cwd: cwd() });
    const result = runApply(prepared, {
      ...realIo(root),
      move: () => {
        throw new Error('disk full');
      },
    });
    expect(formatStopped(result, prepared, cwd())).toContain(
      'With --allow-dirty, git can show changes from before --apply, and it can miss some changes of --apply. The lists above show what --apply changed.\nRun `git status` and `git diff` to see the changes. Use git to undo them.',
    );
  });
});

/** The project with one layer as a git submodule: a repository of its own, inside the first one. */
function withSubmodule(layer: string): string {
  const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
  const inner = join(root, `layers/${layer}`);
  git(inner, 'init', '-q', '-b', 'main');
  git(inner, 'add', '-A');
  git(inner, 'commit', '-q', '-m', 'inner');
  write(root, '.gitignore', '.nuxt\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner, `layers/${layer}`);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'start');
  return root;
}

describe('fix --apply and a git submodule', () => {
  it('refuses a move into a submodule, which would drop its entry from the index', async () => {
    const root = withSubmodule('shared');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      `${shown(root, MOVED)} is in a git submodule, so \`git status\` and \`git diff\` of this repository would not show a move there. Use --allow-dirty to do it anyway.`,
    );
    expect(existsSync(join(root, CART))).toBe(true);
    expect(git(root, 'ls-files', '-s', 'layers/shared')).toContain('160000');
  });

  it('refuses a move out of a submodule', async () => {
    const root = withSubmodule('web');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      `${shown(root, CART)} is in a git submodule, so \`git status\` and \`git diff\` of this repository would not show a change there. Use --allow-dirty to do it anyway.`,
    );
    expect(existsSync(join(root, CART))).toBe(true);
  });

  it('moves with --allow-dirty without git mv into a submodule', async () => {
    const root = withSubmodule('shared');
    silence();
    expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_CLEAN);
    expect(git(root, 'ls-files', '-s', 'layers/shared')).toContain('160000');
  });
});

describe('fix --apply and files that git hides from status', () => {
  it.each([['assume-unchanged'], ['skip-worktree']])('refuses a file marked %s', async mark => {
    const root = repoProject();
    git(root, 'update-index', `--${mark}`, ADMIN_PAGE);
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      `${shown(root, ADMIN_PAGE)} is marked assume-unchanged or skip-worktree in git, so \`git status\` would not show a change to it. Clear the mark, or use --allow-dirty.`,
    );
    expect(existsSync(join(root, CART))).toBe(true);
  });

  it('moves it with --allow-dirty, and a stop says that git can miss changes', async () => {
    const root = repoProject();
    git(root, 'update-index', '--assume-unchanged', ADMIN_PAGE);
    const prepared = prepareApply(await plan(root), root, { allowDirty: true, cwd: cwd() });
    const result = runApply(prepared, {
      ...realIo(root),
      move: () => {
        throw new Error('disk full');
      },
    });
    expect(formatStopped(result, prepared, cwd())).toContain('it can miss some changes of --apply');
  });
});

describe('fix --apply and git that fails', () => {
  it('shows the first line of the message of git, when it is not "no repository"', async () => {
    const root = repoProject();
    writeFileSync(join(root, '.git/config'), 'this is not a config\n');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toMatch(/Cannot read the git state of .*: fatal: bad config/u);
    expect(output.stderr()).not.toContain('is not in a git repository');
  });
});
