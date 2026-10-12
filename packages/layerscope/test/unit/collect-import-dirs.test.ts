import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { assertImportDirsFresh } from '#src/analyze/import-dirs-fresh.ts';
import { collectImportDirs, loadUnimport } from '#src/module/import-dirs.ts';
import type { UnimportScan } from '#src/module/import-dirs.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/** The unimport that Nuxt uses for the fixture: the real code that makes the globs of a scan. */
const loaded = await loadUnimport(NUXT4_ROOT);
const unimport: UnimportScan = loaded.kind === 'ok' ? loaded.unimport : (undefined as never);

function project(files: Record<string, string>): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-record-')));
  for (const name of Object.keys(files)) {
    mkdirSync(join(base, name, '..'), { recursive: true });
    writeFileSync(join(base, name), 'export const x = 1;\n');
  }
  return base;
}

describe('collectImportDirs with the unimport of Nuxt', () => {
  it('loads the unimport of the fixture', () => {
    expect(loaded.kind).toBe('ok');
  });

  it('adds the negation globs of a scan to each dir of it, and leaves the files out', async () => {
    const base = project({ 'a/one.ts': '', 'a/skip.ts': '', 'b/two.ts': '' });
    const dirs = await collectImportDirs(
      [{ dirs: [join(base, 'a'), join(base, 'b'), `!${join(base, 'a/skip.ts')}`] }],
      unimport,
    );
    expect(dirs.map(entry => entry.dir)).toEqual([join(base, 'a'), join(base, 'b')]);
    for (const entry of dirs) {
      expect(entry.globs).toContain(`!${join(base, 'a/skip.ts')}`);
    }
    expect(dirs[0]?.files).toEqual([join(base, 'a/one.ts')]);
  });

  it('uses the scan options of Nitro for the globs of its dirs only', async () => {
    const base = project({ 'app/one.ts': '', 'server/two.ts': '', 'server/three.custom': '' });
    const dirs = await collectImportDirs(
      [
        { dirs: [join(base, 'app')] },
        { dirs: [join(base, 'server')], options: { filePatterns: ['*.custom'] } },
      ],
      unimport,
    );
    expect(dirs.map(entry => entry.files)).toEqual([
      [join(base, 'app/one.ts')],
      [join(base, 'server/three.custom')],
    ]);
    expect(dirs[1]?.globs).toContain(join(base, 'server/*.custom'));
  });
});

describe('collectImportDirs with a dir in two scans', () => {
  it('records a dir that is in the scan of the app and in the scan of Nitro once', async () => {
    const base = project({ 'shared/utils/one.ts': '' });
    const dir = join(base, 'shared/utils');
    const dirs = await collectImportDirs([{ dirs: [dir] }, { dirs: [dir] }], unimport);
    expect(dirs.map(entry => entry.dir)).toEqual([dir]);
  });

  it('keeps both entries when the scan options differ, because the globs differ', async () => {
    const base = project({ 'shared/utils/one.ts': '' });
    const dir = join(base, 'shared/utils');
    const dirs = await collectImportDirs(
      [{ dirs: [dir] }, { dirs: [dir], options: { filePatterns: ['*.custom'] } }],
      unimport,
    );
    expect(dirs).toHaveLength(2);
  });
});

describe('collectImportDirs with a relative dir and a new ignored file', () => {
  it('reads a relative dir from the cwd of the scan, so a check from another cwd finds it', async () => {
    const base = project({ 'late-rel/old.ts': '' });
    const dirs = await collectImportDirs(
      [{ dirs: ['late-rel'], options: { cwd: base } }],
      unimport,
    );
    expect(dirs[0]?.dir).toBe(join(base, 'late-rel'));
    writeFileSync(join(base, 'late-rel/new.ts'), 'export const y = 1;\n');
    // The test process has another cwd than `base`.
    await expect(assertImportDirsFresh(dirs)).rejects.toThrow(/new\.ts is missing/u);
  });

  it('counts a new file that Nuxt ignores once, and one more record clears it', async () => {
    const base = project({ 'composables/use.ts': '' });
    const scans = [{ dirs: [join(base, 'composables')] }];
    const recorded = await collectImportDirs(scans, unimport);
    writeFileSync(join(base, 'composables/helper.d.ts'), 'export {};\n');
    await expect(assertImportDirsFresh(recorded)).rejects.toThrow(/helper\.d\.ts is missing/u);
    const again = await collectImportDirs(scans, unimport);
    await expect(assertImportDirsFresh(again)).resolves.toBeUndefined();
  });
});
