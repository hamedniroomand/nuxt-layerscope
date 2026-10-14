import { join } from 'pathe';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import { readNuxtIgnore } from '#src/module/nuxt.ts';
import type { Nuxt } from '#src/module/nuxt.ts';
import { loadNuxtKit } from '#src/nuxt/kit.ts';
import { createNuxtIgnore } from '#src/registry/nuxt-ignore.ts';
import { NUXT3_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

/** The part of the kit of the fixture that the test uses: the real `isIgnored()` of Nuxt. */
interface FixtureKit {
  loadNuxt: (options: {
    cwd: string;
    ready: boolean;
    overrides: Record<string, unknown>;
  }) => Promise<Nuxt>;
  isIgnored: (path: string, stats: undefined, nuxt: Nuxt) => boolean;
  getLayerDirectories: (nuxt: Nuxt) => { root: string }[];
}

// Patterns of `ignore` in `nuxt.config`, added to the defaults of Nuxt: a negation, a group, a
// path from the root, and a dir.
const IGNORE = [
  'app/composables/keep.spec.ts',
  '!app/composables/keep.spec.ts',
  '**/*.{draft,old}.ts',
  '/vendor',
  'app/legacy',
];

/** Paths in each layer, from the layer root. */
const IN_LAYER = [
  '',
  'app/composables/useCart.ts',
  'app/composables/useCart.spec.ts',
  'app/composables/useCart.test.tsx',
  'app/composables/keep.spec.ts',
  'app/components/Card.stories.ts',
  'app/components/Card.stories.vue',
  'app/components/-Draft.vue',
  'app/components/sub/-Draft.vue',
  'app/utils/helper.d.ts',
  'app/utils/helper.d.vue.ts',
  'app/utils/note.draft.ts',
  'app/utils/note.old.ts',
  'app/legacy/Old.vue',
  'vendor/lib.ts',
  'server/utils/x.spec.ts',
  '.nuxt/types/imports.d.ts',
  '.git/config',
  'node_modules/pkg/index.ts',
];

const opened: Nuxt[] = [];

afterAll(async () => {
  await Promise.all(
    opened.map(async nuxt => {
      await nuxt.close();
    }),
  );
});

async function load(rootDir: string): Promise<{ kit: FixtureKit; nuxt: Nuxt }> {
  const kit = (await loadNuxtKit(rootDir)) as unknown as FixtureKit;
  // Without `ready`, Nuxt does not load the modules, so the source of the module is not loaded.
  const nuxt = await kit.loadNuxt({ cwd: rootDir, ready: false, overrides: { ignore: IGNORE } });
  opened.push(nuxt);
  return { kit, nuxt };
}

describe.each([
  ['Nuxt 3', NUXT3_ROOT],
  ['Nuxt 4', NUXT4_ROOT],
])('the stored ignore rules on %s', (_name, rootDir) => {
  it('give the same result as isIgnored() of the kit of the fixture', async () => {
    const { kit, nuxt } = await load(rootDir);
    const isNuxtIgnored = createNuxtIgnore(readNuxtIgnore(nuxt));
    const roots = kit.getLayerDirectories(nuxt).map(dirs => dirs.root);
    expect(roots.length).toBeGreaterThan(1);
    const paths = [
      ...roots.flatMap(root => IN_LAYER.map(path => `${root}${path}`)),
      // A layer root without its trailing slash, the project root, and paths outside it.
      ...roots.map(root => root.replace(/\/$/u, '')),
      rootDir,
      `${rootDir}-other/app/composables/useCart.spec.ts`,
      join(rootDir, '..', 'outside/useCart.spec.ts'),
      '/tmp/useCart.spec.ts',
    ];
    const expected = paths.map(path => [path, kit.isIgnored(path, undefined, nuxt)]);
    expect(paths.map(path => [path, isNuxtIgnored(path)])).toEqual(expected);
    // The list has paths of each kind, so the test does not pass with a matcher that is always false.
    expect(expected.some(([, ignored]) => ignored === true)).toBe(true);
    expect(expected.some(([, ignored]) => ignored === false)).toBe(true);
  });

  it('include the defaults of Nuxt, also the ignorePrefix', async () => {
    const { nuxt } = await load(rootDir);
    expect(readNuxtIgnore(nuxt).patterns).toEqual(
      expect.arrayContaining(['**/-*.*', '**/*.spec.ts', ...IGNORE.slice(0, 2)]),
    );
  });
});
