import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

/** A giget provider that serves `git archive` of a local repo, so no network is needed. */
export function localGit(input: string) {
  const repo = resolve(import.meta.dirname, input);
  return {
    name: 'remote-layer',
    version: 'head',
    tar: () =>
      spawn('git', ['archive', '--format=tar.gz', '--prefix=remote-layer/', 'HEAD'], {
        cwd: repo,
      }).stdout,
  };
}
