// These tests run bash scripts with a stub gh, so they need a Unix shell. CI runs on Ubuntu only.
import { execFileSync, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

import { dirname, join, resolve } from 'pathe';

import { git } from '#test/git-project.ts';
import { tempDir } from '#test/watch-project.ts';

import { GH_STUB } from './gh-stub.ts';

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
  output: string;
}

/** A copy of drift.sh next to a stub layerscope.sh, and a stub gh that records its arguments. */
function makeStubs(dir: string): Stubs {
  const bin = join(dir, 'bin');
  const scripts = join(dir, 'scripts');
  mkdirSync(bin);
  mkdirSync(scripts);
  const script = join(scripts, 'drift.sh');
  copyFileSync(join(SCRIPTS, 'drift.sh'), script);
  copyFileSync(join(SCRIPTS, 'comment.sh'), join(scripts, 'comment.sh'));
  copyFileSync(join(SCRIPTS, 'root-heading.sh'), join(scripts, 'root-heading.sh'));
  // The stub prints the report that the real CLI prints, or fails when STUB_LS_STATUS is set. With
  // STUB_LS_GROWTH, it adds the growth line and exits 1, as `--fail-on-growth` does.
  writeFileSync(
    join(scripts, 'layerscope.sh'),
    '#!/usr/bin/env bash\n' +
      'if [ -n "${STUB_LS_STATUS:-}" ]; then echo "boom" >&2; exit "$STUB_LS_STATUS"; fi\n' +
      'printf "### layerscope\\n\\n**adds 1** against \\`%s\\`\\n" "$*"\n' +
      'if [ -n "${STUB_LS_GROWTH:-}" ]; then printf "\\n**✖ The code has 1 error that the baseline at \\`x\\` does not have (--fail-on-growth).**\\n"; exit 1; fi\n',
  );
  const calls = join(dir, 'gh-calls.txt');
  // A git that fails every fetch when STUB_FETCH_FAILS is set, and ls-remote with STUB_LS_REMOTE_FAILS.
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  // The script must not use the system jq: this one fails, as a missing jq does.
  writeFileSync(
    join(bin, 'jq'),
    '#!/usr/bin/env bash\necho "jq: command not found (stub)" >&2\nexit 127\n',
  );
  chmodSync(join(bin, 'jq'), 0o755);
  writeFileSync(
    join(bin, 'git'),
    `#!/usr/bin/env bash\nif [ -n "\${STUB_FETCH_FAILS:-}" ] && [ "$3" = fetch ]; then echo 'fatal: stub fetch error' >&2; exit 128; fi\nif [ -n "\${STUB_LS_REMOTE_FAILS:-}" ] && [ "$3" = ls-remote ]; then echo 'fatal: stub ls-remote error' >&2; exit 128; fi\nexec ${realGit} "$@"\n`,
  );
  chmodSync(join(bin, 'git'), 0o755);
  writeFileSync(
    join(bin, 'gh'),
    GH_STUB.replaceAll('CALLS_FILE', calls).replaceAll('BIN_DIR', bin),
  );
  for (const file of [
    script,
    join(scripts, 'comment.sh'),
    join(scripts, 'layerscope.sh'),
    join(bin, 'gh'),
  ]) {
    chmodSync(file, 0o755);
  }
  const summary = join(dir, 'summary.md');
  writeFileSync(summary, '');
  const output = join(dir, 'output.txt');
  writeFileSync(output, '');
  return { script, bin, summary, calls, output };
}

export interface Result {
  status: number | null;
  out: string;
  err: string;
  summary: string;
  gh: string;
  /** The lines the script wrote to GITHUB_OUTPUT. */
  output: string;
  /** The exit status of the step that posts the comment, when it ran. */
  postStatus: number | null;
}

export interface Setup extends Repos {
  /** Runs the two steps of the action: the report, then the comment. */
  drift: (env: Record<string, string>, cwd?: string) => Result;
  /** Runs only the step that posts the comment, with the token. */
  post: (env: Record<string, string>, cwd?: string) => Result;
  /** Runs only the step that builds the report. It has no token, as in action.yml. */
  report: (env: Record<string, string>, cwd?: string) => Result;
  /** Writes a GraphQL answer for the stub gh, and returns its path for STUB_GRAPHQL. */
  answer: (...pages: unknown[]) => string;
}

// The variables of the step that posts the comment. The step that builds the report has none.
const COMMENT_ONLY = new Set([
  'GH_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'PR_NUMBER',
  'IS_FORK',
  'INPUT_COMMENT',
  'REPORT_DIR',
]);

const read = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');

const withoutTokens = (env: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !COMMENT_ONLY.has(name)));

/** Runs one script of the action in the clone, with the stubs first on PATH. */
function runStep(
  repos: Repos,
  stubs: Stubs,
  step: { script: string; output: string; env: Record<string, string>; cwd?: string },
): SpawnSyncReturns<string> {
  return spawnSync(join(dirname(stubs.script), step.script), {
    cwd: step.cwd ?? repos.clone,
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
      GITHUB_OUTPUT: step.output,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '99',
      GITHUB_SERVER_URL: 'https://github.com',
      RUNNER_TEMP: repos.dir,
      ...step.env,
    },
  });
}

/** Writes the pages of a GraphQL answer to a file, one JSON document for each page. */
function writeAnswer(dir: string, pages: unknown[]): string {
  const file = join(dir, 'graphql.json');
  writeFileSync(file, pages.map(page => JSON.stringify(page)).join('\n'));
  return file;
}

/** `shallow` is a clone depth. `true` means depth 1. */
export function setup(shallow: boolean | number): Setup {
  const repos = makeRepos(shallow === true ? 1 : shallow);
  const stubs = makeStubs(repos.dir);
  const reportOutput = join(repos.dir, 'report-output.txt');
  writeFileSync(reportOutput, '');
  const result = (a: SpawnSyncReturns<string>, b?: SpawnSyncReturns<string>): Result => ({
    status: a.status,
    out: a.stdout + (b?.stdout ?? ''),
    err: a.stderr + (b?.stderr ?? ''),
    summary: read(stubs.summary),
    gh: read(stubs.calls),
    output: b === undefined ? read(reportOutput) : read(stubs.output),
    postStatus: b?.status ?? null,
  });
  const buildReport = (env: Record<string, string>, cwd?: string): SpawnSyncReturns<string> => {
    writeFileSync(reportOutput, '');
    return runStep(repos, stubs, {
      script: 'drift.sh',
      output: reportOutput,
      env: withoutTokens(env),
      cwd,
    });
  };
  const report = (env: Record<string, string>, cwd?: string): Result =>
    result(buildReport(env, cwd));
  const drift = (env: Record<string, string>, cwd?: string): Result => {
    const a = buildReport(env, cwd);
    const dir = /^dir=(.*)$/mu.exec(read(reportOutput))?.[1] ?? '';
    const b = runStep(repos, stubs, {
      script: 'comment.sh',
      output: stubs.output,
      env: { GH_TOKEN: 'token', GH_ENTERPRISE_TOKEN: 'token', REPORT_DIR: dir, ...env },
      cwd,
    });
    return result(a, b);
  };
  const answer = (...pages: unknown[]): string => writeAnswer(repos.dir, pages);
  const post = (env: Record<string, string>, cwd?: string): Result => {
    const b = runStep(repos, stubs, {
      script: 'comment.sh',
      output: stubs.output,
      env: { GH_TOKEN: 'token', GH_ENTERPRISE_TOKEN: 'token', ...env },
      cwd,
    });
    return { ...result(b), output: read(stubs.output), postStatus: b.status };
  };
  return { ...repos, drift, report, post, answer };
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
