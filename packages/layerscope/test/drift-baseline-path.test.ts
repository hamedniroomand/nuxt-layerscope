import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { BASELINE_VERSION } from '#src/baseline/index.ts';
import { EXIT_ERROR, run } from '#src/cli.ts';
import { baselineAt } from '#src/drift/git.ts';
import { measureDrift } from '#src/drift/index.ts';
import { git, gitProject } from '#test/git-project.ts';
import { tempDir, write } from '#test/watch-project.ts';

const ENTRY = { rule: 'unresolved-reference', file: 'a.ts', symbol: 'x', toLayer: null };
const FILE = 'layerscope-baseline.json';
const BODY = JSON.stringify({ version: BASELINE_VERSION, entries: [ENTRY] });

// A mode without read access changes nothing on Windows and for root.
const CAN_DENY = process.platform !== 'win32' && process.getuid?.() !== 0;

afterEach(() => {
  vi.restoreAllMocks();
});

function outside(name: string, top: string): string {
  return `${name} is outside the git repository ${top}. drift reads the baseline at HEAD from git. Move the baseline file into the repository, or use --baseline or the \`baseline\` key of the config with a path in the repository.`;
}

describe('baseline at a ref, the path of the file', () => {
  it('reads an absolute path, a path with ./ and a path with backslashes', () => {
    const repo = gitProject();
    repo.write('config/b.json', BODY);
    repo.commit('baseline');
    for (const name of [join(repo.root, 'config/b.json'), './config/b.json', 'config\\b.json']) {
      expect(baselineAt(repo.root, 'HEAD', name).entries).toEqual([ENTRY]);
    }
  });

  it('stops for a path outside the repository, relative or absolute', () => {
    const repo = gitProject();
    const other = join(tempDir(), FILE);
    expect(() => baselineAt(repo.root, 'HEAD', '../b.json')).toThrow(
      outside('../b.json', repo.repo),
    );
    expect(() => baselineAt(repo.root, 'HEAD', other)).toThrow(outside(other, repo.repo));
  });

  it('reads the file at the ref when the file and its dir are gone now', () => {
    const repo = gitProject();
    repo.write('config/b.json', BODY);
    repo.commit('baseline');
    rmSync(join(repo.root, 'config'), { recursive: true });
    expect(baselineAt(repo.root, 'HEAD', 'config/b.json').entries).toEqual([ENTRY]);
  });
});

describe('baseline at a ref, the repository root and the work tree', () => {
  it('says "not a baseline file" for the repository root', () => {
    const repo = gitProject();
    expect(() => baselineAt(repo.root, 'HEAD', repo.repo)).toThrow(
      `${repo.repo} at HEAD is not a baseline file.`,
    );
  });

  it('says "not a baseline file" for a repository root that holds only a link', () => {
    const repo = tempDir();
    git(repo, 'init', '-q', '-b', 'main');
    symlinkSync('x.json', join(repo, 'link.json'));
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'link');
    expect(() => baselineAt(repo, 'HEAD', '.')).toThrow('. at HEAD is not a baseline file.');
  });

  it('stops when the root is not in a git repository, before it reads the ref', () => {
    const dir = tempDir();
    expect(() => baselineAt(dir, 'HEAD', FILE)).toThrow(
      `drift needs a git work tree. ${dir} is not in one.`,
    );
  });

  it('reads the file in a repository whose dir name ends with a space', () => {
    const repo = join(tempDir(), 'repo ');
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    write(repo, FILE, BODY);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'baseline');
    expect(baselineAt(repo, 'HEAD', FILE).entries).toEqual([ENTRY]);
  });

  it('stops when the root is not in a git work tree', () => {
    const repo = gitProject();
    const dir = join(repo.repo, '.git');
    expect(() => baselineAt(dir, 'HEAD', FILE)).toThrow(
      `drift needs a git work tree. ${dir} is not in one.`,
    );
  });
});

describe('baseline at a ref, a name that is not the same now', () => {
  it('reads the name as typed after a rename that changes only the case', () => {
    const repo = gitProject();
    repo.write('Baseline.json', BODY);
    repo.commit('baseline');
    repo.git('mv', 'Baseline.json', 'baseline.json');
    repo.commit('rename');
    expect(baselineAt(repo.root, 'HEAD~1', 'Baseline.json').entries).toEqual([ENTRY]);
  });

  it('stops for a dir that is a link in git to a dir outside the repository', () => {
    const repo = gitProject();
    const target = tempDir();
    write(target, FILE, BODY);
    symlinkSync(target, join(repo.root, 'link'));
    repo.commit('link');
    const name = `link/${FILE}`;
    expect(() => baselineAt(repo.root, 'HEAD', name)).toThrow(outside(name, repo.repo));
  });

  it.each([
    ['in the repository', (root: string): string => join(root, 'shared/config')],
    ['outside the repository', (): string => join(tempDir(), 'config')],
  ])('reads a dir that is real at the ref and a link now, to a dir %s', (_where, target) => {
    const repo = gitProject();
    repo.write('config/b.json', BODY);
    repo.commit('baseline');
    const dir = target(repo.root);
    mkdirSync(join(dir, '..'), { recursive: true });
    renameSync(join(repo.root, 'config'), dir);
    symlinkSync(dir, join(repo.root, 'config'));
    expect(baselineAt(repo.root, 'HEAD', 'config/b.json').entries).toEqual([ENTRY]);
  });
});

describe('baseline at a ref, a path in another folder', () => {
  it('reads a path inside the repository and outside the project, in a monorepo', () => {
    const repo = gitProject({ nested: true });
    repo.write('b.json', BODY);
    repo.write('apps/other/b.json', BODY);
    repo.commit('baseline');
    expect(baselineAt(repo.root, 'HEAD', '../../b.json').entries).toEqual([ENTRY]);
    expect(baselineAt(repo.root, 'HEAD', '../other/b.json').entries).toEqual([ENTRY]);
    expect(() => baselineAt(repo.root, 'HEAD', '../..')).toThrow(
      '../.. at HEAD is not a baseline file.',
    );
  });

  it('reads the file through a symlinked repository dir', () => {
    const repo = gitProject();
    repo.write(FILE, BODY);
    repo.commit('baseline');
    const link = join(tempDir(), 'link');
    symlinkSync(repo.root, link);
    expect(baselineAt(link, 'HEAD', FILE).entries).toEqual([ENTRY]);
    expect(baselineAt(repo.root, 'HEAD', join(link, FILE)).entries).toEqual([ENTRY]);
  });

  it.skipIf(!existsSync(join(tempDir(), '.').toUpperCase()))(
    'reads a file name in the wrong case, on a file system that ignores case',
    () => {
      const repo = gitProject();
      repo.write(FILE, BODY);
      repo.commit('baseline');
      expect(baselineAt(repo.root, 'HEAD', FILE.toUpperCase()).entries).toEqual([ENTRY]);
    },
  );
});

describe('baseline at a ref, symbolic links', () => {
  it('stops for a baseline that is a symbolic link at the ref', () => {
    const repo = gitProject();
    repo.write('real.json', BODY);
    symlinkSync('real.json', join(repo.root, FILE));
    repo.commit('link');
    expect(() => baselineAt(repo.root, 'HEAD', FILE)).toThrow(
      `${FILE} at HEAD is a symbolic link. drift does not follow links in git. Commit the baseline file itself, or use --baseline or the \`baseline\` key of the config with the path of the file that the link points to, if that file is in the repository.`,
    );
  });
});

describe('baseline at a ref, the name of a link in the working tree', () => {
  it.skipIf(!existsSync(join(tempDir(), '.').toUpperCase()))(
    'finds a link typed in the wrong case, on a file system that ignores case',
    () => {
      const repo = gitProject();
      repo.write(FILE, BODY);
      repo.commit('baseline');
      rmSync(join(repo.root, FILE));
      repo.write('other.json', '{}');
      symlinkSync('other.json', join(repo.root, FILE));
      expect(baselineAt(repo.root, 'HEAD', FILE.toUpperCase()).entries).toEqual([ENTRY]);
      repo.commit('link');
      expect(() => baselineAt(repo.root, 'HEAD', FILE.toUpperCase())).toThrow(
        `${FILE.toUpperCase()} at HEAD is a symbolic link.`,
      );
    },
  );

  it.skipIf(!CAN_DENY)('stops when it cannot list the dir of a link', () => {
    const repo = gitProject();
    repo.write('cfg/other.json', '{}');
    symlinkSync('other.json', join(repo.root, 'cfg/b.json'));
    const dir = join(repo.root, 'cfg');
    chmodSync(dir, 0o100);
    try {
      expect(() => baselineAt(repo.root, 'HEAD', 'cfg/b.json')).toThrow(
        `Cannot read ${dir} (EACCES).`,
      );
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  it('reads the file at the name of a link that is in the working tree only', () => {
    const repo = gitProject();
    repo.write(FILE, BODY);
    repo.commit('baseline');
    rmSync(join(repo.root, FILE));
    repo.write('other.json', '{}');
    symlinkSync('other.json', join(repo.root, FILE));
    expect(baselineAt(repo.root, 'HEAD', FILE).entries).toEqual([ENTRY]);
  });
});

describe('drift with a --baseline path', () => {
  const options = (rootDir: string): { rootDir: string; prepare: boolean } => ({
    rootDir,
    prepare: false,
  });

  it('reads an absolute path on the base ref and in the working tree', async () => {
    const repo = gitProject();
    repo.write(FILE, BODY);
    repo.commit('baseline');
    const drift = await measureDrift(options(repo.root), 'HEAD', join(repo.root, FILE));
    expect(drift.baselineSize).toEqual({ base: 1, current: 1 });
  });

  it('reads the base when the file is deleted in the working tree', async () => {
    const repo = gitProject();
    repo.write(FILE, BODY);
    repo.commit('baseline');
    rmSync(join(repo.root, FILE));
    const drift = await measureDrift(options(repo.root), 'HEAD', FILE);
    expect(drift.baselineSize).toEqual({ base: 1, current: 0 });
  });

  it('exits 2 for a baseline outside the repository', async () => {
    const repo = gitProject();
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const args = ['drift', repo.root, '--base', 'HEAD', '--baseline', '../b.json'];
    expect(await run(['node', 'layerscope', ...args])).toBe(EXIT_ERROR);
    expect(err.mock.calls.map(call => String(call[0])).join('')).toBe(
      `layerscope: ${outside('../b.json', repo.repo)}\n`,
    );
  });
});
