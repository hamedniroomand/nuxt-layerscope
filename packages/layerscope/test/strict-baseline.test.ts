import { readFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, EXIT_VIOLATIONS } from '#src/cli.ts';
import { check, gitProject } from '#test/git-project.ts';

const FILE = 'layerscope-baseline.json';
const GONE = 'layers/a/app/pages/gone.vue';

interface Entry {
  rule: string;
  file: string;
  symbol: string;
  toLayer: string | null;
  count?: number;
}

/** A committed project with a baseline of `entries`; the pages of the project have no finding. */
function projectWith(entries: Entry[], name = FILE): string {
  const repo = gitProject();
  repo.write(name, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  return repo.root;
}

const STALE: Entry = { rule: 'unresolved-reference', file: GONE, symbol: './x', toLayer: null };
const LINE = `1 baseline entry no longer occurs and fails the check (--strict-baseline). Run "layerscope check --update-baseline" and commit ${FILE}.`;

describe('check --strict-baseline', () => {
  it('fails on a fixed entry, with a red last line in the text format', async () => {
    const root = projectWith([STALE]);
    const result = await check(['--strict-baseline'], root);
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.out.trimEnd().split('\n').at(-1)).toBe(`✖ ${LINE}`);
    expect(result.err).not.toContain('--strict-baseline');
  });

  it('fails with ::error annotations and a line on stderr in the github format', async () => {
    const root = projectWith([STALE]);
    const result = await check(['--strict-baseline', '--format', 'github'], root);
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.out).toContain(
      `::error file=${FILE},title=layerscope baseline::Fixed baseline entry in ${GONE}`,
    );
    expect(result.out).not.toContain('::notice');
    expect(result.err).toContain(`layerscope: ${LINE}\n`);
  });

  it('keeps the json report on stdout as it is, and says why on stderr', async () => {
    const root = projectWith([STALE]);
    const result = await check(['--strict-baseline', '--format', 'json'], root);
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(() => JSON.parse(result.out) as unknown).not.toThrow();
    expect(result.err).toContain(`layerscope: ${LINE}\n`);
  });
});

describe('check --strict-baseline, the command in the message', () => {
  it('names the root and the --baseline of the run in the command', async () => {
    const root = projectWith([STALE], 'my baseline.json');
    const result = await check([
      root,
      '--baseline',
      'my baseline.json',
      '--strict-baseline',
      '--format',
      'github',
    ]);
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.err).toContain(
      `Run "layerscope check ${root} --baseline 'my baseline.json' --update-baseline"`,
    );
  });
});

describe('check --strict-baseline, the config in the command', () => {
  it('names the --config of the run in the command', async () => {
    const repo = gitProject();
    repo.write(
      'configs/my.config.mjs',
      "export default { layers: { a: { path: 'layers/a' } }, baseline: 'ci/baseline.json' };\n",
    );
    repo.write('ci/baseline.json', `${JSON.stringify({ version: 1, entries: [STALE] })}\n`);
    const result = await check(
      ['--config', 'configs/my.config.mjs', '--strict-baseline', '--format', 'github'],
      repo.root,
    );
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.err).toContain(
      'Run "layerscope check --config configs/my.config.mjs --update-baseline" and commit ci/baseline.json.',
    );
  });
});

describe('check --strict-baseline, which entries count', () => {
  it('counts an entry with a count', async () => {
    const root = projectWith([{ ...STALE, file: 'layers/a/app/pages/p0.vue', count: 2 }]);
    const result = await check(['--strict-baseline'], root);
    expect(result.code).toBe(EXIT_VIOLATIONS);
  });

  it('counts only the entries of the selected files, and gives the command without them', async () => {
    const root = projectWith([STALE]);
    const outside = await check(['--strict-baseline', 'layers/a/app/pages/p0.vue'], root);
    expect(outside.code).toBe(EXIT_CLEAN);
    const inside = projectWith([{ ...STALE, file: 'layers/a/app/pages/p0.vue' }]);
    const result = await check(['--strict-baseline', 'layers/a/app/pages/p0.vue'], inside);
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.out).toContain(`Run "layerscope check --update-baseline" and commit ${FILE}.`);
  });

  it('does not count a shadowed-component entry with the .d.ts source', async () => {
    const root = projectWith([
      { rule: 'shadowed-component', file: GONE, symbol: 'Card', toLayer: 'a' },
    ]);
    const result = await check(['--strict-baseline', '--format', 'github'], root);
    expect(result.code).toBe(EXIT_CLEAN);
    expect(result.out).toContain('::notice');
  });

  it('passes with no baseline file', async () => {
    const result = await check(['--strict-baseline'], gitProject().root);
    expect(result.code).toBe(EXIT_CLEAN);
  });
});

describe('check --strict-baseline, the summary and the refusals', () => {
  it('writes the fixed entries to the summary file', async () => {
    const root = projectWith([STALE]);
    const summary = join(root, 'summary.md');
    await check(['--strict-baseline', '--format', 'github', '--summary', summary], root);
    expect(readFileSync(summary, 'utf8')).toBe(
      `1 baseline entry no longer occurs and fails the check (--strict-baseline). Run \`layerscope check --update-baseline\` and commit ${FILE}.\n\n\`\`\`\n${GONE}  unresolved-reference ./x\n\`\`\`\n`,
    );
  });

  it.each([
    ['--update-baseline', '--strict-baseline cannot be used with --update-baseline.'],
    ['--watch', '--watch cannot be used with --strict-baseline.'],
  ])('refuses %s', async (flag, message) => {
    const result = await check(['--strict-baseline', flag], gitProject().root);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toBe(`layerscope: ${message}\n`);
  });
});

describe('check without --strict-baseline', () => {
  it('lists a fixed entry as a notice and passes', async () => {
    const root = projectWith([STALE]);
    const result = await check(['--format', 'github'], root);
    expect(result.code).toBe(EXIT_CLEAN);
    expect(result.out).toContain('::notice');
    expect(result.err).not.toContain('fixed entry');
  });
});
