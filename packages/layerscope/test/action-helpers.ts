// These tests run bash scripts with a stub gh, so they need a Unix shell. CI runs on Ubuntu only.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

import { join, resolve } from 'pathe';

import { git } from '#test/git-project.ts';
import { tempDir } from '#test/watch-project.ts';

const SCRIPTS = resolve(import.meta.dirname, '../../../scripts');
export const ZEROS = '0'.repeat(40);

export interface Repos {
  dir: string;
  clone: string;
  /** The first commit of main. A shallow clone does not have it. */
  first: string;
  /** The tip of main, a parent of the topic branch. */
  main: string;
  /** A commit in the middle of the topic branch (c5). */
  mid: string;
  /** A working clone of origin, on the topic branch. */
  work: string;
}

/**
 * A bare origin with three commits on main (c1 to c3) and a topic branch with three more (c4 to
 * c6), and a clone of the topic. A clone of depth 5 has c2 to c6: the tip of main is in the middle.
 */
function makeRepos(depth: number | false): Repos {
  const dir = tempDir();
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  const clone = join(dir, 'clone');
  git(dir, 'init', '--bare', '--initial-branch=main', origin);
  // GitHub serves a commit by SHA. A local bare repository needs this option for the same.
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  git(dir, 'clone', origin, work);
  writeFileSync(join(work, 'a.txt'), '0');
  git(work, 'add', '.');
  git(work, 'commit', '-m', 'one');
  const first = git(work, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(work, 'a.txt'), '1');
  git(work, 'commit', '-am', 'two');
  writeFileSync(join(work, 'a.txt'), '2');
  git(work, 'commit', '-am', 'three');
  git(work, 'push', 'origin', 'HEAD:main');
  const main = git(work, 'rev-parse', 'HEAD').trim();
  git(work, 'checkout', '-b', 'topic');
  git(work, 'add', '.');
  for (const name of ['four', 'five', 'six']) {
    writeFileSync(join(work, 'b.txt'), name);
    git(work, 'add', '.');
    git(work, 'commit', '-m', name);
  }
  const mid = git(work, 'rev-parse', 'HEAD~1').trim();
  git(work, 'push', 'origin', 'topic');
  // A decoy: ls-remote matches the end of a ref name, so `refs/heads/main` also matches this ref.
  git(work, 'push', 'origin', 'topic:refs/heads/decoy/refs/heads/main');
  git(
    dir,
    'clone',
    '--branch',
    'topic',
    ...(depth === false ? [] : [`--depth=${depth}`]),
    `file://${origin}`,
    clone,
  );
  return { dir, clone, first, main, mid, work };
}

export interface Stubs {
  script: string;
  bin: string;
  summary: string;
  calls: string;
}

/** A copy of drift.sh next to a stub layerscope.sh, and a stub gh that records its arguments. */
function makeStubs(dir: string): Stubs {
  const bin = join(dir, 'bin');
  const scripts = join(dir, 'scripts');
  mkdirSync(bin);
  mkdirSync(scripts);
  const script = join(scripts, 'drift.sh');
  copyFileSync(join(SCRIPTS, 'drift.sh'), script);
  writeFileSync(join(scripts, 'layerscope.sh'), '#!/usr/bin/env bash\necho "layerscope $*"\n');
  const calls = join(dir, 'gh-calls.txt');
  // A git that fails every fetch when STUB_FETCH_FAILS is set, and ls-remote with STUB_LS_REMOTE_FAILS.
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  writeFileSync(
    join(bin, 'git'),
    `#!/usr/bin/env bash\nif [ -n "\${STUB_FETCH_FAILS:-}" ] && [ "$3" = fetch ]; then echo 'fatal: stub fetch error' >&2; exit 128; fi\nif [ -n "\${STUB_LS_REMOTE_FAILS:-}" ] && [ "$3" = ls-remote ]; then echo 'fatal: stub ls-remote error' >&2; exit 128; fi\nexec ${realGit} "$@"\n`,
  );
  chmodSync(join(bin, 'git'), 0o755);
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\necho "gh $*" >> "${calls}"\n`);
  for (const file of [script, join(scripts, 'layerscope.sh'), join(bin, 'gh')]) {
    chmodSync(file, 0o755);
  }
  const summary = join(dir, 'summary.md');
  writeFileSync(summary, '');
  return { script, bin, summary, calls };
}

export interface Result {
  status: number | null;
  out: string;
  err: string;
  summary: string;
  gh: string;
}

export interface Setup extends Repos {
  drift: (env: Record<string, string>, cwd?: string) => Result;
}

/** `shallow` is a clone depth. `true` means depth 1. */
export function setup(shallow: boolean | number): Setup {
  const repos = makeRepos(shallow === true ? 1 : shallow);
  const stubs = makeStubs(repos.dir);
  const drift = (env: Record<string, string>, cwd?: string): Result => {
    const result = spawnSync(stubs.script, {
      cwd: cwd ?? repos.clone,
      encoding: 'utf8',
      env: {
        PATH: `${stubs.bin}:${process.env.PATH}`,
        HOME: process.env.HOME ?? repos.dir,
        INPUT_ROOT: '.',
        INPUT_CONFIG: '',
        INPUT_PREPARE: 'false',
        INPUT_BASELINE: 'layerscope-baseline.json',
        INPUT_COMMENT: 'false',
        GITHUB_STEP_SUMMARY: stubs.summary,
        ...env,
      },
    });
    return {
      status: result.status,
      out: result.stdout,
      err: result.stderr,
      summary: readFileSync(stubs.summary, 'utf8'),
      gh: existsSync(stubs.calls) ? readFileSync(stubs.calls, 'utf8') : '',
    };
  };
  return { ...repos, drift };
}

export const isShallow = (clone: string): string =>
  git(clone, 'rev-parse', '--is-shallow-repository').trim();
export const count = (clone: string): string => git(clone, 'rev-list', '--count', 'HEAD').trim();
export const has = (clone: string, sha: string): boolean =>
  spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: clone }).status === 0;

/** Adds a commit to main on origin. A clone made before does not have it. */
export function advanceMain(t: Setup): string {
  git(t.work, 'checkout', 'main');
  writeFileSync(join(t.work, 'a.txt'), 'later');
  git(t.work, 'commit', '-am', 'later');
  git(t.work, 'push', 'origin', 'main');
  return git(t.work, 'rev-parse', 'HEAD').trim();
}
