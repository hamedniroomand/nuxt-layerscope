import { rmSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';

import { privateFixture } from './private-fixture.ts';

/** A private copy of the fixture, so that no other test sees the file that this test adds. */
let copy = '';

beforeAll(() => {
  copy = privateFixture();
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
