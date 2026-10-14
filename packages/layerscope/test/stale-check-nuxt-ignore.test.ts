import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';

import { dirname, join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import type { Registry } from '#src/registry/schema.ts';

import { prepareFixture, privateFixture } from './private-fixture.ts';

/** A private copy of the fixture with a `.nuxtignore`, so that no other test sees the new files. */
let copy = '';

beforeAll(() => {
  copy = privateFixture(false);
  // Nuxt matches a path from the root of its layer.
  writeFileSync(join(copy, '.nuxtignore'), 'app/components/Legacy\n');
  prepareFixture(copy);
}, 120_000);

afterAll(() => {
  rmSync(copy, { recursive: true, force: true });
});

function add(file: string): string {
  const path = join(copy, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    file.endsWith('.vue') ? '<template><div /></template>\n' : 'export const x = 1;\n',
  );
  return path;
}

describe('the stale check and the files that Nuxt ignores (#159)', () => {
  it('stores the ignore rules of Nuxt, with the line of .nuxtignore', () => {
    const registry = JSON.parse(
      readFileSync(join(copy, '.nuxt/layerscope/registry.json'), 'utf8'),
    ) as Registry;
    expect(registry.nuxtIgnore.patterns).toEqual(
      expect.arrayContaining(['**/-*.*', '**/*.spec.ts', 'app/components/Legacy']),
    );
  });

  it('passes after new files that Nuxt ignores in a component dir and an auto-import dir', async () => {
    const files = [
      add('layers/web/app/composables/useCart.spec.ts'),
      add('layers/admin/app/components/-Draft.vue'),
      add('layers/admin/app/components/Legacy/Old.vue'),
    ];
    try {
      await expect(analyze({ rootDir: copy })).resolves.toBeDefined();
    } finally {
      for (const file of files) {
        unlinkSync(file);
      }
    }
  }, 120_000);

  it('stops after such a file in server/utils, because Nitro auto-imports it', async () => {
    const file = add('layers/web/server/utils/cart.spec.ts');
    try {
      await expect(analyze({ rootDir: copy })).rejects.toThrow(
        /layers\/web\/server\/utils\/cart\.spec\.ts is missing from the layerscope registry/u,
      );
    } finally {
      unlinkSync(file);
    }
  }, 120_000);
});
