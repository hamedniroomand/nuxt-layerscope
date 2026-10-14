import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { assertImportDirsFresh } from '#src/analyze/import-dirs-fresh.ts';
import {
  ImportDirRecorder,
  collectImportDirs,
  loadUnimport,
  mergeImportDirs,
} from '#src/module/import-dirs.ts';
import type { UnimportScan } from '#src/module/import-dirs.ts';
import type { Nitro } from '#src/module/nuxt.ts';
import { noNuxtIgnore } from '#test/factories.ts';
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
      'nuxt',
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
      'nuxt',
    );
    expect(dirs.map(entry => entry.files)).toEqual([
      [join(base, 'app/one.ts')],
      [join(base, 'server/three.custom')],
    ]);
    expect(dirs[1]?.globs).toContain(join(base, 'server/*.custom'));
  });
});

describe('collectImportDirs with a dir in two scans', () => {
  it('records a dir that is in two scans of the same scanner once', async () => {
    const base = project({ 'shared/utils/one.ts': '' });
    const dir = join(base, 'shared/utils');
    const dirs = await collectImportDirs([{ dirs: [dir] }, { dirs: [dir] }], unimport, 'nuxt');
    expect(dirs.map(entry => entry.dir)).toEqual([dir]);
  });

  it('keeps the entry of the app and the entry of Nitro for a dir in both scans', async () => {
    const base = project({ 'shared/utils/one.ts': '' });
    const dir = join(base, 'shared/utils');
    const [app, nitro] = await Promise.all([
      collectImportDirs([{ dirs: [dir] }], unimport, 'nuxt'),
      collectImportDirs([{ dirs: [dir] }], unimport, 'nitro'),
    ]);
    const merged = mergeImportDirs([app, nitro]);
    expect(merged.map(entry => entry.scanner)).toEqual(['nuxt', 'nitro']);
  });

  it('keeps both entries when the scan options differ, because the globs differ', async () => {
    const base = project({ 'shared/utils/one.ts': '' });
    const dir = join(base, 'shared/utils');
    const dirs = await collectImportDirs(
      [{ dirs: [dir] }, { dirs: [dir], options: { filePatterns: ['*.custom'] } }],
      unimport,
      'nuxt',
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
      'nuxt',
    );
    expect(dirs[0]?.dir).toBe(join(base, 'late-rel'));
    writeFileSync(join(base, 'late-rel/new.ts'), 'export const y = 1;\n');
    // The test process has another cwd than `base`.
    await expect(assertImportDirsFresh(dirs, noNuxtIgnore())).rejects.toThrow(
      /new\.ts is missing/u,
    );
  });

  it('counts a new file of a Nitro dir that Nuxt ignores, and one more record clears it', async () => {
    const base = project({ 'server/utils/use.ts': '' });
    const scans = [{ dirs: [join(base, 'server/utils')] }];
    const recorded = await collectImportDirs(scans, unimport, 'nitro');
    const rules = { ...noNuxtIgnore(), rootDir: base, patterns: ['**/*.d.ts'] };
    writeFileSync(join(base, 'server/utils/helper.d.ts'), 'export {};\n');
    // Nitro does not use the ignore rules of Nuxt, so the check counts the file.
    await expect(assertImportDirsFresh(recorded, rules)).rejects.toThrow(
      /helper\.d\.ts is missing/u,
    );
    const again = await collectImportDirs(scans, unimport, 'nitro');
    await expect(assertImportDirsFresh(again, rules)).resolves.toBeUndefined();
  });
});

describe('ImportDirRecorder.isNitroFile', () => {
  it('finds a file of a Nitro dir by its real path and by a path through a symlink', async () => {
    const base = project({ 'real/server/utils/a.ts': '' });
    symlinkSync(join(base, 'real'), join(base, 'link'));
    const nitro = { options: { imports: { dirs: [join(base, 'link/server/utils')] } } } as Nitro;
    const recorder = new ImportDirRecorder();
    await recorder.recordNitro(NUXT4_ROOT, nitro);
    expect(recorder.isNitroFile(join(base, 'real/server/utils/a.ts'))).toBe(true);
    expect(recorder.isNitroFile(join(base, 'link/server/utils/a.ts'))).toBe(true);
    expect(recorder.isNitroFile(join(base, 'real/server/utils/b.ts'))).toBe(false);
  });
});
