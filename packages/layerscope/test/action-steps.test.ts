// These tests run bash scripts with a stub gh, so they need a Unix shell. CI runs on Ubuntu only.
import { readFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { setup } from './action-helpers.ts';

const ACTION = readFileSync(join(import.meta.dirname, '../../../action.yml'), 'utf8');

/** The lines of the step with this name in action.yml, up to the next step. */
function step(name: string): string[] {
  const lines = ACTION.split('\n');
  const start = lines.findIndex(line => line === `    - name: ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = lines.findIndex((line, index) => index > start && line.startsWith('    - name: '));
  return lines.slice(start, next === -1 ? undefined : next).map(line => line.trim());
}

describe('action.yml, the token', () => {
  const TOKEN = '${{ github.token }}';

  it('gives the step that builds the report no token and no pull request data', () => {
    const lines = step('Build the drift report').join('\n');
    for (const name of [
      'GH_TOKEN',
      'GH_ENTERPRISE_TOKEN',
      'PR_NUMBER',
      'IS_FORK',
      'github.token',
    ]) {
      expect(lines).not.toContain(name);
    }
  });

  it('gives the step that posts the comment the token, for github.com and for Enterprise', () => {
    const lines = step('Post the drift comment');
    expect(lines).toContain(`GH_TOKEN: ${TOKEN}`);
    expect(lines).toContain(`GH_ENTERPRISE_TOKEN: ${TOKEN}`);
  });

  it('never reads a secret', () => {
    expect(ACTION).not.toContain('secrets.');
  });

  it('uses the token in no other step', () => {
    expect(ACTION.split('github.token')).toHaveLength(3);
    expect(step('Check layer boundaries').join('\n')).not.toContain('github.token');
  });

  it('passes the folder of the report to the step that posts the comment', () => {
    expect(step('Post the drift comment')).toContain('REPORT_DIR: ${{ steps.report.outputs.dir }}');
    expect(ACTION).toContain('value: ${{ steps.post.outputs.comment }}');
  });

  it('marks a pull request from a fork only for the pull_request event', () => {
    expect(step('Post the drift comment')).toContain(
      "IS_FORK: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository }}",
    );
  });

  it('gives the report step the base commit of a push and a merge group', () => {
    expect(step('Build the drift report')).toContain(
      'BASE_SHA: ${{ github.event.before || github.event.merge_group.base_sha }}',
    );
  });
});

describe('drift.sh, the step that builds the report', () => {
  const env = { GITHUB_BASE_REF: 'main', INPUT_COMMENT: 'true', PR_NUMBER: '7' };
  const dirOf = (output: string): string => /^dir=(.*)$/mu.exec(output)?.[1] ?? '';
  const file = (output: string, name: string): string =>
    readFileSync(join(dirOf(output), name), 'utf8');

  it('never calls gh, and writes the text, the root and the state for the comment step', () => {
    const t = setup(false);
    const result = t.report(env);
    expect(result.status).toBe(0);
    expect(result.gh).toBe('');
    expect(file(result.output, 'state')).toBe('report');
    expect(file(result.output, 'label')).toBe('.');
    expect(file(result.output, 'text.md')).toContain('### layerscope\n\n**adds 1**');
    expect(result.summary).toBe(file(result.output, 'text.md'));
  });

  it('writes the failure text and the state failed when drift fails', () => {
    const t = setup(false);
    const result = t.report({ ...env, STUB_LS_STATUS: '2' });
    expect(result.status).toBe(2);
    expect(result.gh).toBe('');
    expect(file(result.output, 'state')).toBe('failed');
    expect(file(result.output, 'text.md')).toBe(
      '### layerscope\n\nThe drift report failed. See the log of this job: https://github.com/owner/repo/actions/runs/99.\n',
    );
    expect(result.summary).toBe('');
  });

  it('writes the state skipped when the report is skipped', () => {
    const t = setup(false);
    const result = t.report({ ...env, GITHUB_BASE_REF: '', BASE_SHA: '' });
    expect(file(result.output, 'state')).toBe('skipped');
  });
});

describe('comment.sh, without a report', () => {
  it.each([
    ['no folder', ''],
    ['a folder without a state', '/nonexistent'],
  ])('says skipped, and calls no gh, with %s', (_name, dir) => {
    const t = setup(false);
    const result = t.post({ INPUT_COMMENT: 'true', PR_NUMBER: '7', REPORT_DIR: dir });
    expect(result.status).toBe(0);
    expect(result.gh).toBe('');
    expect(result.output).toBe('comment=skipped\n');
  });
});
