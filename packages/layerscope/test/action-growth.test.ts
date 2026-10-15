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
function gate(files: Record<string, string> | null): { status: number | null; out: string } {
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
    env: { PATH: process.env.PATH, REPORT_DIR: dir },
  });
  return { status: result.status, out: result.stdout };
}

const FAILED =
  '::error title=layerscope drift::fail-on-growth is on, but the drift report could not be made, so layerscope cannot show that the baseline did not grow. See the drift step above.\n';

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

describe('action.yml, the growth step', () => {
  it('is the last step, runs growth.sh with the report folder, and only with the input', () => {
    const start = ACTION.indexOf('    - name: Fail when the drift report shows growth');
    expect(start).toBeGreaterThan(ACTION.indexOf('    - name: Post the drift comment'));
    const lines = ACTION.slice(start)
      .split('\n')
      .map(line => line.trim());
    expect(lines).toContain("if: ${{ always() && inputs.fail-on-growth == 'true' }}");
    expect(lines).toContain('REPORT_DIR: ${{ steps.report.outputs.dir }}');
    expect(lines).toContain('run: \'"$GITHUB_ACTION_PATH/scripts/growth.sh"\'');
    expect(lines.join('\n')).not.toContain('github.token');
    expect(ACTION).toContain('INPUT_FAIL_ON_GROWTH: ${{ inputs.fail-on-growth }}');
  });
});
