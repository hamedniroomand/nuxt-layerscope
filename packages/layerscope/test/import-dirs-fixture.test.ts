import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/** A private copy of the fixture, so that no other test sees the file that this test adds. */
let copy = '';

beforeAll(() => {
  copy = mkdtempSync(join(NUXT4_ROOT, '..', 'nuxt4-private-'));
  cpSync(NUXT4_ROOT, copy, {
    recursive: true,
    filter: source => !/\/(?:node_modules|\.nuxt[^/]*)(?:\/|$)/u.test(source),
  });
  symlinkSync(join(NUXT4_ROOT, 'node_modules'), join(copy, 'node_modules'));
  execFileSync('npx', ['--no-install', 'nuxi', 'prepare'], { cwd: copy, stdio: 'pipe' });
}, 120_000);

afterAll(() => {
  rmSync(copy, { recursive: true, force: true });
});

describe('a check without --prepare after a new auto-import file (the case of #108)', () => {
  it('passes before the file, and stops after a composable that overrides one of another layer', async () => {
    const before = await analyze({ rootDir: copy });
    expect(before.source).toBe('registry');
    // `shared` exports `useFormat`; the new file in `web` overrides it for the layers above it.
    writeFileSync(
      join(copy, 'layers/web/app/composables/useFormat.ts'),
      'export function useFormat() {\n  return 1;\n}\n',
    );
    await expect(analyze({ rootDir: copy })).rejects.toThrow(
      /layers\/web\/app\/composables\/useFormat\.ts is missing from the layerscope registry\. Run "nuxi prepare" again/u,
    );
  });

  it('is clear after prepare', async () => {
    await expect(analyze({ rootDir: copy, prepare: true })).resolves.toBeDefined();
  });
}, 120_000);
