import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import { caseRefusals, pathRefusals } from '#src/fix/checks.ts';
import type { PlannedMove } from '#src/fix/types.ts';

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
import { write } from './fix-project.ts';
import { git } from './git-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const ADMIN_PAGE = 'layers/admin/app/pages/admin.vue';
const COMPOSABLES = 'layers/shared/app/composables';

function outside(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-outside-')));
}

function commit(root: string, message: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

describe('fix --apply and a symbolic link in a path', () => {
  it.each([[[]], [['--allow-dirty']]])(
    'refuses an importer that is a link to a file outside the repository (%j)',
    async flags => {
      const root = repoProject();
      const elsewhere = join(outside(), 'admin.vue');
      writeFileSync(elsewhere, read(root, ADMIN_PAGE));
      rmSync(join(root, ADMIN_PAGE));
      symlinkSync(elsewhere, join(root, ADMIN_PAGE));
      commit(root, 'link');
      const output = silence();
      expect(await run(applyArgs(root, ...flags))).toBe(EXIT_ERROR);
      expect(output.stderr()).toMatch(/is outside the git repository|symbolic link/u);
      expect(readFileSync(elsewhere, 'utf8')).toContain(`'${OLD}'`);
      expect(existsSync(join(root, CART))).toBe(true);
    },
  );

  it.each([['outside the repository'], ['inside the repository']])(
    'refuses a target dir that is a link to a dir %s',
    async place => {
      const root = repoProject();
      const real = place === 'inside the repository' ? join(root, 'elsewhere') : outside();
      mkdirSync(real, { recursive: true });
      rmSync(join(root, COMPOSABLES), { recursive: true, force: true });
      mkdirSync(join(root, 'layers/shared/app'), { recursive: true });
      symlinkSync(real, join(root, COMPOSABLES));
      commit(root, 'link');
      const output = silence();
      expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_ERROR);
      expect(output.stderr()).toContain('has a symbolic link in its path');
      expect(existsSync(join(real, 'useCart.ts'))).toBe(false);
      expect(existsSync(join(root, CART))).toBe(true);
    },
  );
});

describe('fix --apply and a file that is not UTF-8 text', () => {
  it('refuses an importer with a byte that is not UTF-8, so that no byte is replaced', async () => {
    const root = repoProject();
    const bytes = Buffer.concat([
      Buffer.from('// caf'),
      Buffer.from([0xe9]),
      Buffer.from(`\n${read(root, ADMIN_PAGE)}`),
    ]);
    writeFileSync(join(root, ADMIN_PAGE), bytes);
    commit(root, 'latin1');
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('is not UTF-8 text, so layerscope does not edit it.');
    expect(readFileSync(join(root, ADMIN_PAGE)).equals(bytes)).toBe(true);
    expect(existsSync(join(root, CART))).toBe(true);
  });
});

describe('fix --apply and a sparse checkout', () => {
  it('refuses a target outside the cone before the first write', async () => {
    const root = repoProject();
    git(root, 'sparse-checkout', 'set', '--cone', 'layers/web', 'layers/admin', 'layers/shop');
    expect(existsSync(join(root, 'layers/shared'))).toBe(false);
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('git does not move');
    expect(output.stderr()).toContain(
      'the target is outside the sparse checkout. Use --allow-dirty to do it with a plain rename.',
    );
    expect(read(root, ADMIN_PAGE)).toContain(`'${OLD}'`);
    expect(existsSync(join(root, MOVED))).toBe(false);
  });
});

describe('the names that differ only in letter case, without a file system', () => {
  const move: PlannedMove = {
    from: '/p/web/useCart.ts',
    to: '/p/shared/useCart.ts',
    layer: 'shared',
    fixes: 1,
    updates: [],
  };

  it('refuses a target when the dir has the same name in another case', () => {
    const refusals = caseRefusals([move], '/p', () => ['UseCart.ts', 'other.ts']);
    expect(refusals).toEqual([
      'shared/useCart.ts differs only in letter case from shared/UseCart.ts. A case-insensitive file system treats them as one file, so layerscope will not move there.',
    ]);
  });

  it('accepts a dir without such a name, and the file itself', () => {
    expect(caseRefusals([move], '/p', () => ['useCart.ts', 'other.ts'])).toEqual([]);
    expect(caseRefusals([move], '/p', () => [])).toEqual([]);
  });
});

describe('fix --apply and a link that points nowhere', () => {
  it('refuses a target dir that is a dangling link, and writes nothing', async () => {
    const root = repoProject();
    rmSync(join(root, COMPOSABLES), { recursive: true, force: true });
    symlinkSync('missing-dir', join(root, COMPOSABLES));
    commit(root, 'dangling');
    const output = silence();
    expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('has a symbolic link in its path');
    expect(read(root, ADMIN_PAGE)).toContain(`'${OLD}'`);
    expect(existsSync(join(root, CART))).toBe(true);
  });
});

describe('fix --apply and a file with two names', () => {
  it.each([[[]], [['--allow-dirty']]])(
    'refuses an importer that is a hard link to a file outside the repository (%j)',
    async flags => {
      const root = repoProject();
      const elsewhere = join(outside(), 'admin.vue');
      writeFileSync(elsewhere, read(root, ADMIN_PAGE));
      rmSync(join(root, ADMIN_PAGE));
      // The text is the same, so git sees no change and the tree stays clean.
      linkSync(elsewhere, join(root, ADMIN_PAGE));
      const output = silence();
      expect(await run(applyArgs(root, ...flags))).toBe(EXIT_ERROR);
      expect(output.stderr()).toContain(
        `${shown(root, ADMIN_PAGE)} has more than one hard link, so a change to it can change another file too. Update its imports by hand.`,
      );
      expect(readFileSync(elsewhere, 'utf8')).toContain(`'${OLD}'`);
    },
  );
});

describe('fix --apply when git itself fails', () => {
  it('refuses with the line of git, and gives no advice to use --allow-dirty', async () => {
    const root = repoProject();
    writeFileSync(join(root, '.git/index.lock'), '');
    const output = silence();
    expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('git does not move');
    expect(output.stderr()).toContain('index.lock');
    expect(output.stderr()).not.toContain('plain rename');
    expect(read(root, ADMIN_PAGE)).toContain(`'${OLD}'`);
  });
});

describe('fix --apply and a nested repository that the outer one ignores', () => {
  function nested(): string {
    const root = repoProject();
    const inner = join(root, 'layers/shared');
    git(inner, 'init', '-q', '-b', 'main');
    write(root, '.gitignore', '.nuxt\nlayers/shared/\n');
    git(root, 'rm', '-r', '-q', '--cached', 'layers/shared');
    commit(root, 'nested');
    return root;
  }

  it('refuses a target in the other repository', async () => {
    const root = nested();
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      `${shown(root, MOVED)} is in another git repository, so \`git status\` of this repository would not show the move. Use --allow-dirty to do it anyway.`,
    );
    expect(existsSync(join(root, CART))).toBe(true);
  });

  it('moves with a plain rename with --allow-dirty, and does not stage it in the outer index', async () => {
    const root = nested();
    silence();
    expect(await run(applyArgs(root, '--allow-dirty'))).toBe(EXIT_CLEAN);
    expect(existsSync(join(root, MOVED))).toBe(true);
    expect(git(root, 'ls-files', 'layers/shared')).toBe('');
  });
});

describe('pathRefusals outside the repository', () => {
  it('refuses a file that is not under the top dir of the repository', () => {
    const dir = outside();
    const file = join(dir, 'a.ts');
    writeFileSync(file, 'export {};\n');
    const refusals = pathRefusals(
      new Set([file]),
      [join(dir, 'new/b.ts')],
      join(outside(), 'repo'),
      dir,
    );
    expect(refusals).toEqual([
      'a.ts is outside the git repository, so layerscope does not change it.',
      'new/b.ts is outside the git repository, so layerscope does not change it.',
    ]);
  });
});
