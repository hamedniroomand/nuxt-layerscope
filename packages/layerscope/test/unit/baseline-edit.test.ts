import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { ignoreFindings, removeEntries, restoreBaseline } from '#src/baseline/edit.ts';
import {
  keyOf as keyOfEntry,
  surplusKeyOf,
  createBaseline,
  keyOf,
  toKeyed,
  writeBaseline,
} from '#src/baseline/index.ts';
import { makeFinding } from '#test/factories.ts';

const ROOT = '/app';

function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'layerscope-baseline-')), 'layerscope-baseline.json');
}

const findings = [
  makeFinding(),
  makeFinding({ line: 9 }),
  makeFinding({ symbol: 'useTotal' }),
  makeFinding({ file: '/app/pages/admin.vue', rule: 'unresolved-reference', toLayer: null }),
];
const key = (index: number): string => keyOf(toKeyed(findings[index] ?? makeFinding(), ROOT));

describe('ignoreFindings', () => {
  it('writes exactly what `check --update-baseline` writes when every key is ignored', () => {
    const file = tempFile();
    const reference = tempFile();
    const edit = ignoreFindings(
      file,
      findings.map((_, index) => key(index)),
      findings,
      ROOT,
    );
    writeBaseline(reference, createBaseline(findings, ROOT));
    expect(readFileSync(file, 'utf8')).toBe(readFileSync(reference, 'utf8'));
    expect(edit.before).toBeNull();
  });

  it('counts every sibling of an ignored row and keeps other entries', () => {
    const file = tempFile();
    ignoreFindings(file, [key(2)], findings, ROOT);
    const edit = ignoreFindings(file, [key(0)], findings, ROOT);
    expect(edit.after.entries).toEqual([
      {
        rule: 'layer-boundary',
        file: 'pages/index.vue',
        symbol: 'useCart',
        toLayer: 'shop',
        count: 2,
      },
      { rule: 'layer-boundary', file: 'pages/index.vue', symbol: 'useTotal', toLayer: 'shop' },
    ]);
    expect(edit.before).toContain('useTotal');
  });
});

describe('ignoreFindings again', () => {
  it('rewrites the same bytes when the key is already in the baseline', () => {
    const file = tempFile();
    ignoreFindings(file, [key(0)], findings, ROOT);
    const text = readFileSync(file, 'utf8');
    const edit = ignoreFindings(file, [key(0)], findings, ROOT);
    expect(readFileSync(file, 'utf8')).toBe(text);
    expect(edit.before).toBe(text);
  });
});

describe('removeEntries and restoreBaseline', () => {
  it('drops entries by key and undoes byte for byte', () => {
    const file = tempFile();
    ignoreFindings(file, [key(0), key(2)], findings, ROOT);
    const text = readFileSync(file, 'utf8');
    const edit = removeEntries(file, [key(0)]);
    expect(edit.after.entries.map(entry => entry.symbol)).toEqual(['useTotal']);
    restoreBaseline(file, edit.before);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('deletes the file when the edit created it', () => {
    const file = tempFile();
    const edit = ignoreFindings(file, [key(3)], findings, ROOT);
    expect(existsSync(file)).toBe(true);
    restoreBaseline(file, edit.before);
    expect(existsSync(file)).toBe(false);
    writeFileSync(file, 'kept');
    restoreBaseline(file, 'kept');
    expect(readFileSync(file, 'utf8')).toBe('kept');
  });
});

const entry = { rule: 'layer-boundary', file: 'a.vue', symbol: 'useX', toLayer: 'b' } as const;
const other = { ...entry, symbol: 'useY' };

function written(count?: number): string {
  const file = tempFile();
  writeFileSync(file, JSON.stringify({ version: 1, entries: [{ ...entry, count }, { ...other }] }));
  return file;
}

describe('removeEntries with a surplus', () => {
  it('lowers the count by the surplus and keeps the entry', () => {
    const file = written(3);
    const edit = removeEntries(file, [surplusKeyOf(entry)], new Map([[surplusKeyOf(entry), 2]]));
    expect(edit.after.entries).toEqual([{ ...entry }, other]);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { entries: object[] };
    expect(saved.entries[0]).not.toHaveProperty('count');
  });

  it('keeps a count of 2 or more', () => {
    const file = written(4);
    const edit = removeEntries(file, [surplusKeyOf(entry)], new Map([[surplusKeyOf(entry), 1]]));
    expect(edit.after.entries[0].count).toBe(3);
  });

  it('deletes the entry when the surplus is the whole count', () => {
    const file = written(2);
    const edit = removeEntries(file, [surplusKeyOf(entry)], new Map([[surplusKeyOf(entry), 2]]));
    expect(edit.after.entries).toEqual([other]);
  });

  it('deletes an entry with no count when its surplus is 1', () => {
    const file = written();
    const edit = removeEntries(file, [surplusKeyOf(entry)], new Map([[surplusKeyOf(entry), 1]]));
    expect(edit.after.entries).toEqual([other]);
  });
});

describe('removeEntries without the surplus', () => {
  it('ignores a surplus that the caller did not give', () => {
    const file = written(3);
    const edit = removeEntries(file, [surplusKeyOf(entry)]);
    expect(edit.after.entries[0].count).toBe(3);
  });

  it('drops the whole entry for the key of the entry, as before', () => {
    const file = written(3);
    const edit = removeEntries(file, [keyOfEntry(entry)]);
    expect(edit.after.entries).toEqual([other]);
  });

  it('undoes byte for byte', () => {
    const file = written(3);
    const text = readFileSync(file, 'utf8');
    const edit = removeEntries(file, [surplusKeyOf(entry)], new Map([[surplusKeyOf(entry), 2]]));
    restoreBaseline(file, edit.before);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });
});
