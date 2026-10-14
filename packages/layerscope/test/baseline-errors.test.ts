import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_VERSION, assertBaselineOption, parseBaselineText } from '#src/baseline/index.ts';
import { tempDir } from '#test/watch-project.ts';

const ENTRY = { rule: 'unresolved-reference', file: 'a.ts', symbol: 'x', toLayer: null };

function text(value: unknown): string {
  return JSON.stringify(value);
}

describe('baseline text', () => {
  it('names the file when the text is empty', () => {
    expect(() => parseBaselineText('', 'b.json')).toThrow(
      'b.json is not valid JSON (Unexpected end of JSON input). Fix the file, or create it again with --update-baseline.',
    );
  });

  it('names the file and the ref when the text is not JSON', () => {
    expect(() => parseBaselineText('<<<<<<< HEAD\n', 'b.json', 'origin/main')).toThrow(
      /^b\.json at origin\/main is not valid JSON \(.*\)\. Fix the file on origin\/main, or use another ref with --base\.$/su,
    );
  });

  it('still removes whole-line comments, as readJson does', () => {
    const body = `// kept by hand\n${text({ version: BASELINE_VERSION, entries: [ENTRY] })}`;
    expect(parseBaselineText(body, 'b.json').entries).toHaveLength(1);
  });

  it('tells a user with a newer file to update layerscope', () => {
    const newer = text({ version: BASELINE_VERSION + 1, entries: [] });
    expect(() => parseBaselineText(newer, 'b.json')).toThrow(
      `b.json has baseline version ${BASELINE_VERSION + 1}, and this layerscope reads version ${BASELINE_VERSION}. Update layerscope. Do not create the file again, because that removes the newer data.`,
    );
  });

  it('tells a user with an older file to create it again', () => {
    const older = text({ version: BASELINE_VERSION - 1, entries: [] });
    expect(() => parseBaselineText(older, 'b.json')).toThrow(
      `b.json has baseline version ${BASELINE_VERSION - 1}, and this layerscope reads version ${BASELINE_VERSION}. Create it again with --update-baseline.`,
    );
  });
});

describe('baseline text, wrong content', () => {
  it.each([
    ['a missing version', { entries: [] }],
    ['a version that is a string', { version: '1', entries: [] }],
    ['entries that are not a list', { version: BASELINE_VERSION, entries: {} }],
    ['a null value', null],
    ['a list', []],
  ])('refuses %s', (_name, value) => {
    expect(() => parseBaselineText(text(value), 'b.json')).toThrow(
      'b.json is not a layerscope baseline. Create it again with --update-baseline.',
    );
  });

  it.each([-1, 0, 0.5, '2', null])('names the file and the entry for the count %j', count => {
    const body = text({ version: BASELINE_VERSION, entries: [ENTRY, { ...ENTRY, count }] });
    expect(() => parseBaselineText(body, 'b.json')).toThrow(
      'b.json: entry 1 is not a valid baseline entry. A "count" must be a whole number above 0.',
    );
  });

  it('gives no count advice for an entry that is wrong in another way', () => {
    const body = text({ version: BASELINE_VERSION, entries: [{ ...ENTRY, symbol: 1 }] });
    expect(() => parseBaselineText(body, 'b.json')).toThrow(
      /^b\.json: entry 0 is not a valid baseline entry$/u,
    );
  });
});

describe('baseline text, special input', () => {
  it.each(['1.5', '1e999', '-0.5'])('does not call the version %s newer or older', version => {
    const body = `{ "version": ${version}, "entries": [] }`;
    expect(() => parseBaselineText(body, 'b.json')).toThrow(
      'b.json is not a layerscope baseline. Create it again with --update-baseline.',
    );
  });

  it('reads text with a leading BOM', () => {
    const body = `\uFEFF${text({ version: BASELINE_VERSION, entries: [ENTRY] })}`;
    expect(parseBaselineText(body, 'b.json').entries).toHaveLength(1);
  });
});

describe('the baseline option', () => {
  it('accepts a file name', () => {
    expect(() => {
      assertBaselineOption('b.json');
    }).not.toThrow();
  });

  it.each([2024, 16, 1000])('refuses the number %j and tells how to write a file name', value => {
    expect(() => {
      assertBaselineOption(value);
    }).toThrow(
      '--baseline needs a file name. Leave it out to use the baseline file of the config, or layerscope-baseline.json. For a file name that is a number, write it as ./<name>.',
    );
  });

  it('gives no hint for 0, which is what the parser gives for an empty value', () => {
    expect(() => {
      assertBaselineOption(0);
    }).toThrow(
      /^--baseline needs a file name\. Leave it out to use the baseline file of the config, or layerscope-baseline\.json\.$/u,
    );
  });

  it('refuses a flag that is given twice', () => {
    expect(() => {
      assertBaselineOption(['a.json', 'b.json']);
    }).toThrow('--baseline was given more than once. Give it one time.');
  });

  it('refuses an empty name in the API, without the name of a flag', async () => {
    await expect(analyze({ rootDir: tempDir(), baseline: '' })).rejects.toThrow(
      /^baseline must be a non-empty file name\.$/u,
    );
  });
});
