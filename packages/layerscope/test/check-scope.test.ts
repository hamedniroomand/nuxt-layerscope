import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { AnalysisCache } from '#src/analyze/cache.ts';
import { analyze } from '#src/analyze/index.ts';

import { BAD, check, files, gitProject, reportOf } from './git-project.ts';
import { project, tempDir } from './watch-project.ts';

const PAGE0 = 'layers/a/app/pages/p0.vue';
const PAGE1 = 'layers/a/app/pages/p1.vue';

function baseline(root: string, entries: { file: string; symbol: string }[]): void {
  const list = entries.map(entry => ({
    rule: 'unresolved-reference',
    file: entry.file,
    symbol: entry.symbol,
    toLayer: null,
  }));
  writeFileSync(
    join(root, 'layerscope-baseline.json'),
    JSON.stringify({ version: 1, entries: list }),
  );
}

describe('the baseline in a check of some files', () => {
  it('still suppresses an accepted finding of a selected file', async () => {
    const repo = gitProject();
    baseline(repo.root, [{ file: PAGE0, symbol: './missing' }]);
    repo.write(PAGE0, BAD);
    repo.git('add', PAGE0);
    const result = await check([repo.root, '--staged', '--format', 'json'], repo.root);
    const report = reportOf(result);
    expect(report.findings).toEqual([]);
    expect(report.baseline?.suppressed).toHaveLength(1);
    expect(result.code).toBe(0);
  });

  it('reports a fixed entry only for a selected file', async () => {
    const repo = gitProject();
    baseline(repo.root, [
      { file: PAGE0, symbol: './gone' },
      { file: PAGE1, symbol: './gone' },
    ]);
    repo.write(PAGE0, `${BAD}<!-- touched -->\n`);
    repo.git('add', PAGE0);
    const report = reportOf(await check([repo.root, '--staged', '--format', 'json'], repo.root));
    expect(report.baseline?.removable.map(entry => entry.file)).toEqual([PAGE0]);
  });

  it('refuses to write the baseline from a selection', async () => {
    const repo = gitProject();
    repo.write(PAGE0, BAD);
    repo.git('add', PAGE0);
    const result = await check([repo.root, '--staged', '--update-baseline'], repo.root);
    expect(result.code).toBe(2);
    expect(result.err).toContain('cannot write the baseline');
  });
});

describe('the layer-cycle rule in a check of some files', () => {
  it('scans every file and still reports only the selected ones', async () => {
    const repo = gitProject({ rules: "'unresolved-reference': 'error', 'layer-cycle': 'error'" });
    repo.write(PAGE0, BAD);
    repo.write(PAGE1, BAD);
    repo.git('add', PAGE0);
    const report = reportOf(await check([repo.root, '--staged', '--format', 'json'], repo.root));
    expect(files(report)).toEqual([PAGE0]);
    expect(report.notes.join('\n')).toContain('All files were scanned for the layer-cycle rule');
  });
});

describe('usage errors', () => {
  it.each([
    [['--staged', '--changed'], 'Use one of'],
    [['--staged', '--since', 'HEAD'], 'Use one of'],
    [['--staged', `${PAGE0}`], 'Use one of'],
    [['--staged', '--watch'], 'leave out --staged'],
  ])('refuses %j', async (flags, message) => {
    const repo = gitProject();
    const result = await check([repo.root, ...flags], repo.root);
    expect(result.code).toBe(2);
    expect(result.err).toContain(message);
  });

  it('refuses --staged outside a git repository', async () => {
    const root = project(1);
    const result = await check([root, '--staged'], root);
    expect(result.code).toBe(2);
    expect(result.err).toContain('--staged needs a git repository');
  });

  it('refuses --since outside a git repository', async () => {
    const dir = tempDir();
    const result = await check([dir, '--since', 'main'], dir);
    expect(result.code).toBe(2);
    expect(result.err).toContain('--since needs a git repository');
  });
});

describe('analyze with only', () => {
  it('scans only the selected files', async () => {
    const root = project(20);
    const cache = new AnalysisCache();
    const result = await analyze({
      rootDir: root,
      cache,
      envKey: 'k',
      only: [join(root, 'layers/a/app/pages/p3.vue'), join(root, 'layers/a/app/pages/p7.vue')],
    });
    expect(cache.misses).toBe(2);
    expect(result.files).toHaveLength(2);
  });

  it('scans nothing for an empty selection', async () => {
    const root = project(5);
    const cache = new AnalysisCache();
    const result = await analyze({ rootDir: root, cache, envKey: 'k', only: [] });
    expect(cache.misses).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
