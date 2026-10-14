import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { analyze as Analyze } from '#src/analyze/index.ts';
import type { keyOf as KeyOf, toKeyed as ToKeyed } from '#src/baseline/index.ts';
import type { isLocal as IsLocal } from '#src/suggest/context.ts';
import { makeLayer } from '#test/factories.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/**
 * The file system of a machine that ignores case: `remap` changes a typed path to the path on
 * disk before each file system call. The identity keeps the real file system, so the same tests
 * also run on macOS and Windows with no mock.
 */
const state = vi.hoisted(() => ({ remap: (path: string): string => path }));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof NodeFs>();
  const fix = (path: unknown): unknown => (typeof path === 'string' ? state.remap(path) : path);
  const realpathSync = Object.assign(
    (path: string, options?: never) => actual.realpathSync(state.remap(path), options),
    {
      native: (path: string, options?: never) =>
        actual.realpathSync.native(state.remap(path), options),
    },
  );
  return {
    ...actual,
    realpathSync,
    statSync: ((path: never, options?: never) =>
      actual.statSync(fix(path) as never, options)) as never,
    existsSync: (path: never): boolean => actual.existsSync(fix(path) as never),
  };
});

const actualFs = await vi.importActual<typeof NodeFs>('node:fs');

const TYPED_ROOT = NUXT4_ROOT.replace(/nuxt4$/u, 'NUXT4');

let analyze: typeof Analyze;
let keyOf: typeof KeyOf;
let toKeyed: typeof ToKeyed;
let isLocal: typeof IsLocal;

beforeAll(async () => {
  // The test setup file loads these modules before the mock exists, so they are loaded again.
  vi.resetModules();
  ({ analyze } = await import('#src/analyze/index.ts'));
  ({ keyOf, toKeyed } = await import('#src/baseline/index.ts'));
  ({ isLocal } = await import('#src/suggest/context.ts'));
});

beforeEach(() => {
  state.remap = (path: string): string => path;
});

describe.each([
  ['a file system that ignores case (mocked)', true],
  ['the real file system', false],
])('a root typed with another case than the dir on disk, on %s', (_name, mocked) => {
  // A case-sensitive file system has no `NUXT4` dir, so only the mock can run there.
  const skip = !mocked && !actualFs.existsSync(TYPED_ROOT);

  it.skipIf(skip)('gives the same baseline keys and local layers as the real root', async () => {
    const expected = await analyze({ rootDir: NUXT4_ROOT });
    if (mocked) {
      state.remap = (path: string): string =>
        path === TYPED_ROOT || path.startsWith(`${TYPED_ROOT}/`)
          ? NUXT4_ROOT + path.slice(TYPED_ROOT.length)
          : path;
    }
    const result = await analyze({ rootDir: TYPED_ROOT });
    const keys = (r: typeof result): string[] =>
      r.findings.map(finding => keyOf(toKeyed(finding, r.rootDir)));
    expect(result.rootDir).toBe(expected.rootDir);
    expect(keys(result)).toEqual(keys(expected));
    expect(keys(result).length).toBeGreaterThan(0);
    for (const key of keys(result)) {
      expect(key).not.toContain('..');
    }
    const local = (r: typeof result): boolean[] => r.layers.map(layer => isLocal(layer, r.rootDir));
    expect(local(result)).toEqual(local(expected));
    expect(local(result)).toContain(true);
  });
});

describe('an import with another case than the dir on disk', () => {
  it('is owned by the layer of the real dir', async () => {
    vi.resetModules();
    const { resolveSpecifier } = await import('#src/resolve/specifier.ts');
    const { createOwnerLookup } = await import('#src/nuxt/owner.ts');
    const base = actualFs.realpathSync(actualFs.mkdtempSync(join(tmpdir(), 'layerscope-case-')));
    try {
      actualFs.mkdirSync(join(base, 'shop/app/composables'), { recursive: true });
      actualFs.mkdirSync(join(base, 'admin/app'), { recursive: true });
      actualFs.writeFileSync(
        join(base, 'shop/app/composables/useCart.ts'),
        'export const a = 1;\n',
      );
      state.remap = (path: string): string => path.replace(`${base}/Shop`, `${base}/shop`);
      const resolved = resolveSpecifier(
        '../../Shop/app/composables/useCart',
        join(base, 'admin/app/page.ts'),
        [],
        join(base, '.nuxt'),
        new Map(),
      );
      const ownerOf = createOwnerLookup([
        makeLayer('root', base),
        makeLayer('shop', join(base, 'shop')),
        makeLayer('admin', join(base, 'admin')),
      ]);
      expect(resolved.kind).toBe('file');
      expect(resolved.kind === 'file' ? ownerOf(resolved.file)?.name : null).toBe('shop');
    } finally {
      actualFs.rmSync(base, { recursive: true, force: true });
    }
  });
});
