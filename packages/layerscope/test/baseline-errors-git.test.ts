import { mkdirSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { BASELINE_VERSION, readBaseline } from '#src/baseline/index.ts';
import { baselineAt } from '#src/drift/git.ts';
import { gitProject } from '#test/git-project.ts';
import { tempDir } from '#test/watch-project.ts';

const ENTRY = { rule: 'unresolved-reference', file: 'a.ts', symbol: 'x', toLayer: null };
const FILE = 'layerscope-baseline.json';

function text(value: unknown): string {
  return JSON.stringify(value);
}

describe('baseline file', () => {
  it('reads a missing file as no baseline', () => {
    expect(readBaseline(join(tempDir(), FILE))).toBeNull();
  });

  it('refuses a directory', () => {
    const root = tempDir();
    mkdirSync(join(root, FILE));
    expect(() => readBaseline(join(root, FILE))).toThrow(
      `${join(root, FILE)} is a directory, not a baseline file.`,
    );
  });

  it('refuses an empty file, with the file name', () => {
    const file = join(tempDir(), FILE);
    writeFileSync(file, '');
    expect(() => readBaseline(file)).toThrow(`${file} is not valid JSON`);
  });
});

describe('baseline at a ref', () => {
  it('reads a ref without the file as an empty baseline', () => {
    const repo = gitProject();
    expect(baselineAt(repo.root, 'HEAD', FILE).entries).toEqual([]);
  });

  it.each([
    ['conflict markers', '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> other\n'],
    ['an empty file', ''],
    ['text that is not JSON', 'nope'],
  ])('stops for %s', (_name, body) => {
    const repo = gitProject();
    repo.write(FILE, body);
    repo.commit('baseline');
    expect(() => baselineAt(repo.root, 'HEAD', FILE)).toThrow(`${FILE} at HEAD is not valid JSON`);
  });

  it('stops for a wrong version and for an entry that is not valid', () => {
    const repo = gitProject();
    repo.write(FILE, text({ version: BASELINE_VERSION + 1, entries: [] }));
    repo.commit('newer');
    expect(() => baselineAt(repo.root, 'HEAD', FILE)).toThrow('Update layerscope.');
    repo.write(FILE, text({ version: BASELINE_VERSION, entries: [{ ...ENTRY, count: -1 }] }));
    repo.commit('count');
    expect(() => baselineAt(repo.root, 'HEAD', FILE)).toThrow(
      `${FILE} at HEAD: entry 0 is not a valid baseline entry.`,
    );
  });

  it('reads a file with a space in its path', () => {
    const repo = gitProject();
    repo.write('my dir/b file.json', text({ version: BASELINE_VERSION, entries: [ENTRY] }));
    repo.commit('baseline');
    expect(baselineAt(repo.root, 'HEAD', 'my dir/b file.json').entries).toEqual([ENTRY]);
    repo.write('my dir/b file.json', 'nope');
    repo.commit('broken');
    expect(() => baselineAt(repo.root, 'HEAD', 'my dir/b file.json')).toThrow(
      'my dir/b file.json at HEAD is not valid JSON',
    );
  });
});

describe('baseline at a ref, other objects', () => {
  it('stops for a directory at the ref, with one line', () => {
    const repo = gitProject();
    repo.write(`${FILE}/x.json`, '{}');
    repo.commit('directory');
    expect(() => baselineAt(repo.root, 'HEAD', FILE)).toThrow(
      `${FILE} at HEAD is not a baseline file. Fix the file on HEAD, or use another ref with --base.`,
    );
  });

  it('reads a baseline with a BOM at the ref', () => {
    const repo = gitProject();
    repo.write(FILE, `\uFEFF${text({ version: BASELINE_VERSION, entries: [ENTRY] })}`);
    repo.commit('bom');
    expect(baselineAt(repo.root, 'HEAD', FILE).entries).toEqual([ENTRY]);
  });
});
