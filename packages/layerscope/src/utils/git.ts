import { execFileSync, spawnSync } from 'node:child_process';

import { dirname, resolve } from 'pathe';

import { realPath } from '#src/utils/fs.ts';

/** The variables that make git use one repository, whatever `-C` says. */
export const LOCAL_GIT_ENV = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_NAMESPACE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
];

/**
 * The environment without the variables that point git at one repository. A git hook sets some of
 * them, for example `GIT_DIR` and `GIT_INDEX_FILE`. They make `git -C <dir>` use the hook's
 * repository, not the repository of `<dir>`.
 */
export function cleanGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean = { ...env };
  for (const name of LOCAL_GIT_ENV) {
    Reflect.deleteProperty(clean, name);
  }
  return clean;
}

/** Git output that is one path, without the final newline. A dir name can end with a space. */
export function pathOutput(out: string): string {
  return out.replace(/\r?\n$/u, '');
}

/**
 * Whether the index file is directly in `gitDir`, as every index file of a hook is. A folder below
 * it is the git directory of a linked worktree or a submodule, which is another index. The file can
 * be a lock file that git has not made yet.
 */
function indexInGitDir(index: string, gitDir: string): boolean {
  return realPath(dirname(resolve(process.cwd(), index))) === realPath(gitDir);
}

/**
 * The environment for `git -C <rootDir>`. A pre-commit hook points `GIT_INDEX_FILE` at the index
 * that will be committed (`index.lock`, `next-index-*.lock`), so `--staged` must read it. The other
 * local git variables point at the repository of the hook, so they are removed. The index variable
 * stays only when it is directly in the git directory of `rootDir`.
 */
export function gitEnv(rootDir: string): NodeJS.ProcessEnv {
  const env = cleanGitEnv();
  const index = process.env.GIT_INDEX_FILE;
  if (index === undefined || index === '') {
    return env;
  }
  try {
    const out = execFileSync('git', ['-C', rootDir, 'rev-parse', '--absolute-git-dir'], {
      encoding: 'utf8',
      env,
      stdio: 'pipe',
    });
    if (indexInGitDir(index, pathOutput(out))) {
      env.GIT_INDEX_FILE = resolve(process.cwd(), index);
    }
  } catch {
    // Git fails or the folder is missing: the safe choice is to read no index variable.
  }
  return env;
}

/** Runs `git -C <rootDir> ...` and returns its output. Throws when git fails or is missing. */
export function git(rootDir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    env: gitEnv(rootDir),
    stdio: 'pipe',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * The environment of `gitWithStderr`. Git translates its warnings, so the C locale keeps them in
 * English for the code that reads them. With the C locale, gettext also does not read `LANGUAGE`.
 */
export function englishGitEnv(rootDir: string): NodeJS.ProcessEnv {
  const env = gitEnv(rootDir);
  Reflect.deleteProperty(env, 'LANGUAGE');
  return { ...env, LC_ALL: 'C' };
}

/**
 * Like `git`, but it also gives what git printed on stderr, in English, for a warning of a
 * command that did not fail. A failure throws an error with `stderr`, as `git` does.
 */
export function gitWithStderr(
  rootDir: string,
  ...args: string[]
): { stdout: string; stderr: string } {
  const result = spawnSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    env: englishGitEnv(rootDir),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw Object.assign(new Error(`git ${args.join(' ')} failed`), { stderr: result.stderr });
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

/** The top dir of the work tree of `dir`, as git gives it. Throws when git fails. */
export function topLevel(dir: string): string {
  return pathOutput(git(dir, 'rev-parse', '--show-toplevel'));
}

/** Like `git`, but `null` instead of a throw. */
export function tryGit(rootDir: string, ...args: string[]): string | null {
  try {
    return git(rootDir, ...args);
  } catch {
    return null;
  }
}

/** The entries of NUL-separated output (`-z`), without the empty one after the last NUL. */
export function splitNul(output: string): string[] {
  return output.split('\0').filter(entry => entry !== '');
}
