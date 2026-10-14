// These tests run bash scripts with a stub CLI, so they need a Unix shell. CI runs on Ubuntu only.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

import { join, resolve } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { tempDir } from '#test/watch-project.ts';

const SCRIPTS = resolve(import.meta.dirname, '../../../scripts');

// The stub CLI prints one annotation, writes $STUB_SUMMARY to the file of --summary, records the
// arguments, and exits with $STUB_STATUS.
const STUB = `#!/usr/bin/env bash
echo "$*" > "$ARGS_FILE"
echo '::error file=a.ts,line=1,col=1,title=layerscope x::stub annotation'
while [ "$#" -gt 0 ]; do
  if [ "$1" = --summary ]; then printf '%s' "\${STUB_SUMMARY:-}" > "$2"; fi
  shift
done
exit "\${STUB_STATUS:-0}"
`;

interface Run {
  dir: string;
  status: number | null;
  out: string;
  summary: string;
  args: string;
}

function runCheck(env: Record<string, string> = {}): Run {
  const dir = tempDir();
  const scripts = join(dir, 'scripts');
  mkdirSync(scripts);
  for (const name of ['check.sh', 'root-heading.sh']) {
    copyFileSync(join(SCRIPTS, name), join(scripts, name));
  }
  writeFileSync(join(scripts, 'layerscope.sh'), STUB);
  for (const name of ['check.sh', 'layerscope.sh']) {
    chmodSync(join(scripts, name), 0o755);
  }
  const summary = join(dir, 'summary.md');
  const args = join(dir, 'args.txt');
  writeFileSync(summary, '');
  const result = spawnSync(join(scripts, 'check.sh'), {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      INPUT_ROOT: '.',
      INPUT_CONFIG: '',
      INPUT_PREPARE: 'false',
      INPUT_BASELINE: 'layerscope-baseline.json',
      GITHUB_STEP_SUMMARY: summary,
      RUNNER_TEMP: dir,
      ARGS_FILE: args,
      ...env,
    },
  });
  return {
    dir,
    status: result.status,
    out: result.stdout,
    summary: readFileSync(summary, 'utf8'),
    args: readFileSync(args, 'utf8'),
  };
}

const LIST = 'The check found 1 error.\n\n```\nerror x a.ts:1:1 m\n```\n';

describe('check.sh', () => {
  it('prints the annotations unchanged, and adds the list under a heading', () => {
    const run = runCheck({ STUB_SUMMARY: LIST });
    expect(run.status).toBe(0);
    expect(run.out).toBe('::error file=a.ts,line=1,col=1,title=layerscope x::stub annotation\n');
    expect(run.summary).toBe(`### layerscope findings\n\n${LIST}`);
  });

  it('names a root that is not . in the heading', () => {
    const run = runCheck({ STUB_SUMMARY: LIST, INPUT_ROOT: 'apps/shop' });
    expect(run.summary.startsWith('### layerscope findings: `apps/shop`\n\n')).toBe(true);
  });

  it('writes nothing to the summary when the file is empty', () => {
    const run = runCheck({ STUB_SUMMARY: '' });
    expect(run.summary).toBe('');
  });

  it.each([0, 1, 2])('keeps the exit status %i of the CLI', status => {
    const run = runCheck({ STUB_STATUS: String(status), STUB_SUMMARY: LIST });
    expect(run.status).toBe(status);
    expect(run.summary).toContain(LIST);
  });

  it('gives the CLI the format, the baseline, the summary file and the options', () => {
    const run = runCheck({ INPUT_CONFIG: 'my.config.ts', INPUT_PREPARE: 'true' });
    expect(run.args).toMatch(
      /^check \. --format github --summary \S+ --baseline layerscope-baseline\.json --config my\.config\.ts --prepare\n$/u,
    );
  });

  it('gives no --baseline when the input is empty, so the config names the file', () => {
    const run = runCheck({ INPUT_BASELINE: '' });
    expect(run.args).toMatch(/^check \. --format github --summary \S+\n$/u);
  });
});

describe('check.sh, the summary file', () => {
  it('uses the same heading code as the drift report, for a root with a backtick', () => {
    const run = runCheck({ STUB_SUMMARY: LIST, INPUT_ROOT: 'a`b' });
    expect(run.summary.startsWith('### layerscope findings: `` a`b ``\n\n')).toBe(true);
  });

  it('does not leave its temporary file behind', () => {
    const run = runCheck({ STUB_SUMMARY: LIST });
    expect(readdirSync(run.dir).filter(name => name.startsWith('layerscope-summary'))).toEqual([]);
  });

  it.each([0, 2])(
    'keeps the status %i of the CLI when it cannot write to the job summary',
    status => {
      const run = runCheck({
        STUB_SUMMARY: LIST,
        STUB_STATUS: String(status),
        GITHUB_STEP_SUMMARY: '/nonexistent/folder/summary.md',
      });
      expect(run.status).toBe(status);
    },
  );
});
