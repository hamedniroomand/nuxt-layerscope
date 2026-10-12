import { describe, expect, it } from 'vite-plus/test';

import { formatFindingsSummary, SUMMARY_LINE_LIMIT } from '#src/report/findings-summary.ts';

import { makeFinding } from './factories.ts';

const CWD = '/app';
const error = (overrides = {}): ReturnType<typeof makeFinding> => makeFinding(overrides);
const warning = (overrides = {}): ReturnType<typeof makeFinding> =>
  makeFinding({ severity: 'warn', ...overrides });

describe('formatFindingsSummary', () => {
  it('is empty when there is no finding', () => {
    expect(formatFindingsSummary([], CWD)).toBe('');
  });

  it('counts the errors and the warnings, and lists each finding on one line', () => {
    const text = formatFindingsSummary([error(), warning({ line: 9, column: 2 })], CWD);
    expect(text).toBe(
      [
        'The check found 1 error and 1 warning.',
        '',
        '```',
        'error layer-boundary pages/index.vue:3:5 Auto-import "useCart" crosses from layer "web" into "shop"',
        'warning layer-boundary pages/index.vue:9:2 Auto-import "useCart" crosses from layer "web" into "shop"',
        '```',
        '',
      ].join('\n'),
    );
  });

  it.each([
    [[error(), error()], 'The check found 2 errors.'],
    [[warning(), warning(), warning()], 'The check found 3 warnings.'],
    [[error(), warning(), warning()], 'The check found 1 error and 2 warnings.'],
  ])('writes the count as a sentence', (findings, sentence) => {
    expect(formatFindingsSummary(findings, CWD).startsWith(`${sentence}\n`)).toBe(true);
  });
});

describe('formatFindingsSummary, text of the findings', () => {
  it('uses the first line of the message only', () => {
    const text = formatFindingsSummary([error({ message: 'First line\nSecond line' })], CWD);
    expect(text).toContain(' First line\n');
    expect(text).not.toContain('Second line');
  });

  it('keeps Markdown and HTML inside the fence, and the fence is longer than any backtick run', () => {
    const message = 'Use <script>alert(1)</script> and ```code``` and `x`';
    const text = formatFindingsSummary([error({ message })], CWD);
    const lines = text.split('\n');
    expect(lines[2]).toBe('````');
    expect(lines[4]).toBe('````');
    expect(lines[3]).toContain(message);
  });

  it('stops the list at the line limit, and still counts every finding', () => {
    const findings = Array.from({ length: 250 }, (_, index) => error({ line: index + 1 }));
    const text = formatFindingsSummary(findings, CWD);
    expect(text.startsWith('The check found 250 errors.\n')).toBe(true);
    expect(text.split('\n').filter(line => line.startsWith('error '))).toHaveLength(
      SUMMARY_LINE_LIMIT,
    );
    expect(
      text.endsWith('The list stops at 200 lines. Run layerscope check to see all findings.\n'),
    ).toBe(true);
  });

  it('does not write the cap text for a list that fits', () => {
    const findings = Array.from({ length: 200 }, (_, index) => error({ line: index + 1 }));
    expect(formatFindingsSummary(findings, CWD)).not.toContain('The list stops');
  });
});
