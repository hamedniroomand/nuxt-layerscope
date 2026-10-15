// These tests run bash scripts with a stub CLI, so they need a Unix shell. CI runs on Ubuntu only.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { join, resolve } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { tempDir } from '#test/watch-project.ts';

import { setup } from './action-helpers.ts';

const GROWTH = resolve(import.meta.dirname, '../../../scripts/growth.sh');
const ACTION = readFileSync(join(import.meta.dirname, '../../../action.yml'), 'utf8');

const dirOf = (output: string): string => /^dir=(.*)$/mu.exec(output)?.[1] ?? '';

describe('drift.sh with fail-on-growth', () => {
  const env = { GITHUB_BASE_REF: 'main', INPUT_FAIL_ON_GROWTH: 'true' };

  it('gives --fail-on-growth to the CLI', () => {
    const result = setup(false).report(env);
    expect(result.summary).toContain('--fail-on-growth');
  });

  it('does not give --fail-on-growth to the CLI without the input', () => {
    const result = setup(false).report({ GITHUB_BASE_REF: 'main' });
    expect(result.summary).not.toContain('--fail-on-growth');
  });

  it('keeps the report and writes the base to `grew` when the CLI shows growth', () => {
    const result = setup(false).report({ ...env, STUB_LS_GROWTH: '1' });
    const dir = dirOf(result.output);
    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, 'state'), 'utf8')).toBe('report');
    expect(readFileSync(join(dir, 'grew'), 'utf8')).toBe('origin/main');
    expect(result.summary).toContain('(--fail-on-growth).**');
  });

  it('says failed, and writes no `grew`, for an exit 1 without the growth line', () => {
    const result = setup(false).report({ ...env, STUB_LS_STATUS: '1' });
    const dir = dirOf(result.output);
    expect(result.status).toBe(1);
    expect(readFileSync(join(dir, 'state'), 'utf8')).toBe('failed');
    expect(existsSync(join(dir, 'grew'))).toBe(false);
  });

  it('writes `nobase` when the event has no base commit', () => {
    const result = setup(false).report({ ...env, GITHUB_BASE_REF: '', BASE_SHA: '' });
    expect(existsSync(join(dirOf(result.output), 'nobase'))).toBe(true);
  });
});

/** Runs growth.sh on a report folder with these files. */
function gate(
  files: Record<string, string> | null,
  env: Record<string, string> = {},
): { status: number | null; out: string } {
  let dir = '';
  if (files !== null) {
    dir = join(tempDir(), 'report');
    mkdirSync(dir);
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
  }
  const result = spawnSync(GROWTH, {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, REPORT_DIR: dir, ...env },
  });
  return { status: result.status, out: result.stdout };
}

const FAILED =
  '::error title=layerscope drift::fail-on-growth is on, but the drift report could not be made, so nothing shows that the baseline did not grow. See the drift step above.\n';

describe('growth.sh', () => {
  it('fails, and names the base, when the report shows growth', () => {
    expect(gate({ state: 'report', grew: 'origin/main' })).toEqual({
      status: 1,
      out: '::error title=layerscope drift::The drift report shows errors that the baseline at origin/main does not have. See the drift report in the job summary.\n',
    });
  });

  it('passes a report without growth', () => {
    expect(gate({ state: 'report' })).toEqual({ status: 0, out: '' });
  });

  it.each([
    ['a failed report', { state: 'failed' }],
    ['a skipped report', { state: 'skipped' }],
    ['a folder without a state', {}],
    ['no folder', null],
  ])('fails for %s', (_name, files) => {
    expect(gate(files)).toEqual({ status: 1, out: FAILED });
  });

  it('passes with a notice when the event has no base commit', () => {
    expect(gate({ state: 'skipped', nobase: '' })).toEqual({
      status: 0,
      out: '::notice title=layerscope drift::fail-on-growth: this event has no base commit, so there is nothing to compare.\n',
    });
  });
});

const GREW =
  '::error title=layerscope drift::The drift report shows errors that the baseline at origin/main does not have. See the drift report in the job summary.\n';

describe('growth.sh, the label that accepts growth', () => {
  it('passes with a notice when the pull request has the label', () => {
    expect(gate({ state: 'report', grew: 'origin/main' }, { ACCEPT_GROWTH: 'true' })).toEqual({
      status: 0,
      out: '::notice title=layerscope drift::The drift report shows errors that the baseline at origin/main does not have. The pull request has the label "layerscope: accept growth", so this step passes.\n',
    });
  });

  it('fails as before without the label', () => {
    expect(gate({ state: 'report', grew: 'origin/main' }, { ACCEPT_GROWTH: 'false' })).toEqual({
      status: 1,
      out: GREW,
    });
  });

  it('still fails for a report that could not be made', () => {
    expect(gate({ state: 'failed' }, { ACCEPT_GROWTH: 'true' })).toEqual({
      status: 1,
      out: FAILED,
    });
  });
});

describe('action.yml, the label of the growth step', () => {
  it('reads the label only for the events of a pull request', () => {
    expect(ACTION.match(/ACCEPT_GROWTH:.*/gu)).toEqual([
      "ACCEPT_GROWTH: \"${{ (github.event_name == 'pull_request' || github.event_name == 'pull_request_target') && contains(github.event.pull_request.labels.*.name, 'layerscope: accept growth') }}\"",
    ]);
    const start = ACTION.indexOf('    - name: Fail on drift growth or a missing report');
    expect(ACTION.indexOf('ACCEPT_GROWTH:')).toBeGreaterThan(start);
  });
});

describe('action.yml, the growth step', () => {
  it('is the last step, runs growth.sh with the report folder, and only with the input', () => {
    const start = ACTION.indexOf('    - name: Fail on drift growth or a missing report');
    expect(start).toBeGreaterThan(ACTION.indexOf('    - name: Post the drift comment'));
    const lines = ACTION.slice(start)
      .split('\n')
      .map(line => line.trim());
    expect(lines).toContain("if: ${{ always() && inputs.fail-on-growth == 'true' }}");
    expect(lines).toContain('REPORT_DIR: ${{ steps.report.outputs.dir }}');
    expect(lines).toContain('run: \'"$GITHUB_ACTION_PATH/scripts/growth.sh"\'');
    expect(lines.join('\n')).not.toContain('github.token');
    // GitHub compares strings without case, so the gate and drift.sh read the input with the same
    // expression: a `TRUE` that runs the gate also gives drift.sh `true`.
    const condition = "inputs.fail-on-growth == 'true'";
    expect(lines).toContain(`if: \${{ always() && ${condition} }}`);
    expect(ACTION.match(/INPUT_FAIL_ON_GROWTH:.*/gu)).toEqual([
      `INPUT_FAIL_ON_GROWTH: \${{ ${condition} }}`,
    ]);
    expect(ACTION.match(/inputs\.fail-on-growth\b.*/gu)).toHaveLength(2);
  });
});
