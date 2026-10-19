import { appendFileSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';
import { renameNotes, renamesSince } from '#src/drift/git.ts';
import { englishGitEnv, gitWithStderr } from '#src/utils/git.ts';

import { FILE, commit, counts, drift, findingsBaseline, writeBaseline } from './drift-project.ts';
import { ADMIN, CART, SHARED, SHOP, WEB, applyPlan, cartProject, write } from './fix-project.ts';
import { git, gitProject } from './git-project.ts';
import type { GitProject } from './git-project.ts';
import { tempDir } from './watch-project.ts';

/** Commits the project with its accepted errors on `main`, and goes to a branch `change`. */
async function accept(root: string, layers: string[]): Promise<void> {
  writeFileSync(
    join(root, 'layerscope.config.mjs'),
    `export default { layers: { ${layers.join(', ')} }, rules: { 'unresolved-reference': 'error' } };\n`,
  );
  writeFileSync(join(root, '.gitignore'), '.nuxt\n');
  git(root, 'init', '-q', '-b', 'main');
  writeBaseline(root, FILE, (await findingsBaseline(root)).entries);
  commit(root, 'accept');
  git(root, 'switch', '-q', '-c', 'change');
}

/** Commits the project with its accepted errors on `main`, applies the plan of `fix` on `change`. */
async function acceptAndFix(root: string, layers: string[]): Promise<void> {
  await accept(root, layers);
  await applyPlan(root);
  commit(root, 'fix');
}

const WEB_SHARED = "web: { path: 'layers/web', allow: ['shared'] }";
const SMALL =
  "import { noop } from '../../../shared/app/utils/noop';\nexport const useCart = () => noop() + missingThing();\n";

describe('drift after fix --apply', () => {
  // `fix` moves useCart.ts from web to shared, which admin and shop may use. The file keeps an
  // accepted error of its own, and the imports of admin and shop are rewritten.
  it('counts the fixed imports, and no error for the moved file', async () => {
    const root = cartProject([SHARED, WEB, ADMIN, SHOP]);
    writeFileSync(
      join(root, CART),
      `export const useCart = () => missingThing();\n${'// note\n'.repeat(10)}`,
    );
    await acceptAndFix(root, [SHARED, WEB, ADMIN, SHOP]);
    const result = await drift(root);
    expect(git(root, 'diff', '-M', '--name-status', 'main')).toContain(
      'layers/shared/app/composables/useCart.ts',
    );
    expect(counts(result)).toEqual([0, 2]);
  });

  // The move rewrites the import of a small file, so less than half of the file stays the same.
  it('follows a small file whose import the move rewrites', async () => {
    const root = cartProject([SHARED, WEB_SHARED, ADMIN, SHOP]);
    write(root, CART, SMALL);
    await acceptAndFix(root, [SHARED, WEB_SHARED, ADMIN, SHOP]);
    expect(git(root, 'diff', '-M', '--name-status', 'main')).not.toContain('R');
    expect(counts(await drift(root))).toEqual([0, 2]);
  });

  // The same small change as above, but to a place in shared that `fix` does not choose.
  it('does not follow a small file that moves to another place in another layer', async () => {
    const root = cartProject([SHARED, WEB_SHARED, ADMIN, SHOP]);
    write(root, CART, SMALL);
    await accept(root, [SHARED, WEB_SHARED, ADMIN, SHOP]);
    const moved = 'layers/shared/app/utils/useCart.ts';
    git(root, 'rm', '-q', CART);
    write(root, moved, SMALL.replace('../../../shared/app/utils/noop', './noop'));
    commit(root, 'move to utils');
    expect(git(root, 'diff', '-M30%', '--name-status', 'main')).toMatch(/^R0[34]\d\t/mu);
    const result = await drift(root);
    expect(result.added.map(entry => [entry.file, entry.symbol])).toContainEqual([
      moved,
      'missingThing',
    ]);
  });
});

describe('renamesSince', () => {
  it('keeps a rename in the root, with paths relative to the root, and not one that leaves it', () => {
    const project = gitProject({ nested: true });
    project.write('apps/web/a.ts', `${'export const a = 1;\n'.repeat(5)}`);
    project.write('apps/web/out.ts', `${'export const b = 1;\n'.repeat(5)}`);
    project.commit('files');
    const repo = join(project.root, '../..');
    git(repo, 'mv', 'apps/web/a.ts', 'apps/web/b.ts');
    git(repo, 'mv', 'apps/web/out.ts', 'apps/other/out.ts');
    expect([...renamesSince(project.root, 'HEAD').renames]).toEqual([
      ['b.ts', { from: 'a.ts', score: 100 }],
    ]);
  });
});

/** A file of `count` lines that no other file of the test has. */
const lines = (name: string, count = 20): string =>
  Array.from({ length: count }, (_, index) => `export const ${name}${index} = ${index};\n`).join(
    '',
  );

/** Moves the file and adds a line, so git finds the rename only with its exhaustive check. */
function moveWithEdit(project: GitProject, from: string, to: string): void {
  project.git('mv', from, to);
  appendFileSync(join(project.repo, to), 'export const extra = 1;\n');
  project.git('add', to);
}

/** Three files of the root move with edits, and git may check only one pair. */
function overTheLimit(): GitProject {
  const project = gitProject({ nested: true });
  for (const name of ['a', 'b', 'c']) {
    project.write(`apps/web/${name}.ts`, lines(name));
  }
  project.commit('files');
  project.git('config', 'diff.renameLimit', '1');
  for (const name of ['a', 'b', 'c']) {
    moveWithEdit(project, `apps/web/${name}.ts`, `apps/web/${name}2.ts`);
  }
  return project;
}

describe('renamesSince and the rename limit of git', () => {
  it('gives git only the files of the root, so renames outside it do not count for the limit', () => {
    const project = gitProject({ nested: true });
    for (const name of ['a', 'b', 'c']) {
      project.write(`apps/other/${name}.ts`, lines(name));
    }
    project.write('apps/web/w.ts', lines('w'));
    project.commit('files');
    project.git('config', 'diff.renameLimit', '1');
    for (const name of ['a', 'b', 'c']) {
      moveWithEdit(project, `apps/other/${name}.ts`, `apps/other/${name}2.ts`);
    }
    moveWithEdit(project, 'apps/web/w.ts', 'apps/web/w2.ts');
    const { renames, notes } = renamesSince(project.root, 'HEAD');
    expect([...renames.keys()]).toEqual(['w2.ts']);
    expect(notes).toEqual([]);
  });

  it('gives a note when git skips its rename check', () => {
    const project = overTheLimit();
    const { renames, notes } = renamesSince(project.root, 'HEAD');
    expect(renames.size).toBe(0);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(
      /^git did not check every rename since HEAD: .*rename detection was skipped due to too many files\. .*diff\.renameLimit.* A file that moved with edits, for example by `layerscope fix`, can then count as added and fixed\.$/u,
    );
  });
});

describe('drift and the rename limit of git', () => {
  it('prints the note on stderr, and keeps the JSON report the same', async () => {
    const project = overTheLimit();
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const code = await run([
      'node',
      'layerscope',
      'drift',
      project.root,
      '--base',
      'HEAD',
      '--format',
      'json',
    ]);
    const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
    const [stdout, stderr] = [text(out), text(err)];
    vi.restoreAllMocks();
    expect(code).toBe(0);
    expect(stderr).toContain('layerscope: note: git did not check every rename since HEAD: ');
    expect(Object.keys(JSON.parse(stdout) as object)).not.toContain('notes');
  });
});

describe('the path of the root for git', () => {
  // As a pattern, `app*` also matches `apps/...`, and those renames would count for the limit.
  // Windows does not allow `*` in a file name.
  it.skipIf(process.platform === 'win32')('reads the root as a path, not as a pattern', () => {
    const repo = tempDir();
    const names = ['b', 'c', 'd'];
    write(repo, 'app*/a.ts', lines('a'));
    for (const name of names) {
      write(repo, `apps/${name}.ts`, lines(name));
    }
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'start');
    git(repo, 'config', 'diff.renameLimit', '1');
    for (const [from, to] of [
      ['app*/a.ts', 'app*/a2.ts'],
      ...names.map(name => [`apps/${name}.ts`, `apps/${name}2.ts`]),
    ]) {
      git(repo, 'mv', from, to);
      appendFileSync(join(repo, to), 'export const extra = 1;\n');
      git(repo, 'add', to);
    }
    const { renames, notes } = renamesSince(join(repo, 'app*'), 'HEAD');
    expect([...renames.keys()]).toEqual(['a2.ts']);
    expect(notes).toEqual([]);
  });
});

describe('renameNotes', () => {
  it('reads only the rename limit texts of git, old and new', () => {
    const skipped = 'warning: exhaustive rename detection was skipped due to too many files.';
    const advice =
      'warning: you may want to set your diff.renameLimit variable to at least 4 and retry the command.';
    expect(renameNotes(`${skipped}\n${advice}\n`, 'main')).toEqual([
      `git did not check every rename since main: ${skipped.slice(9)} ${advice.slice(9)} A file that moved with edits, for example by \`layerscope fix\`, can then count as added and fixed.`,
    ]);
    expect(
      renameNotes('warning: inexact rename detection was skipped due to too many files.\n', 'main'),
    ).toHaveLength(1);
  });

  it('gives no note for another warning that names a file with rename in its path', () => {
    const crlf =
      "warning: in the working copy of 'utils/rename-file.ts', LF will be replaced by CRLF the next time Git touches it\n";
    expect(renameNotes(crlf, 'main')).toEqual([]);
  });
});

describe('the environment of git when layerscope reads its warnings', () => {
  it('uses the C locale, so git does not translate the warnings', () => {
    vi.stubEnv('LANG', 'de_DE.UTF-8');
    vi.stubEnv('LANGUAGE', 'de');
    try {
      const env = englishGitEnv(process.cwd());
      expect(env.LC_ALL).toBe('C');
      expect(env.LANGUAGE).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // A shell alias of git prints the variable as git's child sees it.
  it.skipIf(process.platform === 'win32')('gives that environment to the git call', () => {
    const { stdout } = gitWithStderr(
      process.cwd(),
      '-c',
      'alias.locale=!printf %s "$LC_ALL"',
      'locale',
    );
    expect(stdout).toBe('C');
  });
});
