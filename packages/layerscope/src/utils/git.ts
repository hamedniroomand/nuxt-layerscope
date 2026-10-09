import { execFileSync } from 'node:child_process';

/** Runs `git -C <rootDir> ...` and returns its output. Throws when git fails or is missing. */
export function git(rootDir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 256 * 1024 * 1024,
  });
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
