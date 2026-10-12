import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { loadEnvironment } from '#src/analyze/environment.ts';
import { globImportFiles } from '#src/registry/import-files.ts';
import type { Registry, RegistryImportDir } from '#src/registry/schema.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/** The registry that a real `nuxi prepare` of the fixture wrote, with the real Nuxt hook order. */
const registry = JSON.parse(
  readFileSync(`${NUXT4_ROOT}/.nuxt/layerscope/registry.json`, 'utf8'),
) as Registry;

const importDirs: RegistryImportDir[] = registry.importDirs ?? [];

function dirOf(path: string): RegistryImportDir | undefined {
  return importDirs.find(entry => entry.dir === `${NUXT4_ROOT}/${path}`);
}

describe('the auto-import dirs in the registry that Nuxt wrote', () => {
  it('lists a composables dir of a layer with the files that the scan matched', () => {
    expect(dirOf('layers/web/app/composables')?.files).toEqual([
      `${NUXT4_ROOT}/layers/web/app/composables/useCart.ts`,
    ]);
  });

  it('keeps the dirs that do not exist yet, with no files', () => {
    expect(dirOf('layers/web/app/utils')?.files).toEqual([]);
    expect(dirOf('layers/web/shared/utils')?.files).toEqual([]);
  });

  it('lists the shared and the server dirs of a layer', () => {
    expect(dirOf('layers/shared/app/utils')).toBeDefined();
    expect(dirOf('layers/web/server/utils/**/*')?.files).toHaveLength(1);
  });

  it('records the globs that the scan used, and the same globs match the recorded files', async () => {
    const entry = dirOf('layers/admin/app/composables');
    expect(entry?.globs[0]).toBe(entry?.dir);
    expect(entry?.globs.some(glob => glob.startsWith(`${entry.dir}/*.{`))).toBe(true);
    expect(entry?.files).toHaveLength(2);
    expect(await globImportFiles(entry?.globs ?? [])).toEqual(entry?.files);
  });
});

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A build dir beside the fixture's `.nuxt` with a registry that lists one more import dir. */
function buildDirWith(entry: RegistryImportDir): string {
  const buildDir = mkdtempSync(join(NUXT4_ROOT, '.nuxt-imports-'));
  created.push(buildDir);
  mkdirSync(join(buildDir, 'layerscope'));
  const changed = { ...registry, importDirs: [...importDirs, entry] };
  // The files of the build dir are known by the path of the build dir.
  const text = JSON.stringify(changed).replaceAll(`${NUXT4_ROOT}/.nuxt/`, `${buildDir}/`);
  writeFileSync(join(buildDir, 'layerscope/registry.json'), text);
  return buildDir;
}

describe('a check without --prepare after a new auto-import file', () => {
  it('stops and asks for a new prepare, as for a new component', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'layerscope-new-composable-'));
    created.push(dir);
    writeFileSync(join(dir, 'useNotice.ts'), 'export const useNotice = () => 1;\n');
    const buildDir = buildDirWith({ dir, globs: [dir, join(dir, '*.ts')], files: [] });
    await expect(
      loadEnvironment({ rootDir: NUXT4_ROOT, buildDir, config: {}, source: 'registry' }),
    ).rejects.toThrow(/useNotice\.ts is missing from the layerscope registry/u);
  });
});
