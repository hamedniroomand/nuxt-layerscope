import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { buildTree, toVueRouter4 } from 'unrouting';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import type { Nuxt } from '#src/module/nuxt.ts';
import { recordShadowedFiles } from '#src/module/shadowed-files.ts';

/** A small seeded random source, so that a failure gives the same input again. */
function random(seed: number): (max: number) => number {
  let state = seed;
  return max => {
    state = (state * 48_271) % 2_147_483_647;
    return state % max;
  };
}

const PARTS = [
  ['', 'shop/', '(g)/'],
  // `shop` gives a parent route for the files in `shop/`.
  ['index', 'shop', 'cart', '[id]'],
  ['', '.client', '@view'],
  ['.vue', '.ts'],
];
/** A page file and the index of its layer, which unrouting takes as the priority. */
interface PageFile {
  path: string;
  priority: number;
}

const LAYERS = 4;
const MODES = ['server', 'client'];
const top = mkdtempSync(join(tmpdir(), 'layerscope-pages-oracle-'));
afterAll(() => {
  rmSync(top, { recursive: true, force: true });
});

/** Random page files in up to four layers, in the order that Nuxt gives them to unrouting. */
function pageFiles(next: (max: number) => number, root: string): PageFile[] {
  const files = new Map<string, number>();
  for (const _ of Array.from({ length: next(8) + 1 })) {
    const layer = next(LAYERS);
    const name = PARTS.map(options => options[next(options.length)]).join('');
    files.set(join(root, `L${layer}`, 'app/pages', name), layer);
  }
  return [...files]
    .map(([path, priority]) => ({ path, priority }))
    .toSorted((a, b) => a.priority - b.priority || (a.path < b.path ? -1 : 1));
}

/** The files that Nuxt 4 keeps, by the route tree that it builds with unrouting. */
function keptFiles(input: PageFile[], roots: string[]): Set<string> {
  return new Set(buildTree(input, { roots, modes: MODES })['~fileIndex'].keys());
}

/** The `file` of each route, also of the nested routes: the files that Nuxt gives the module. */
function routeFiles(routes: { file?: string; children?: unknown[] }[]): string[] {
  return routes.flatMap(route => [
    ...(route.file === undefined ? [] : [route.file]),
    ...routeFiles((route.children ?? []) as typeof routes),
  ]);
}

/** Writes the files, and gives the slice of Nuxt that the module reads, with the routes of Nuxt 4. */
function project(root: string, input: PageFile[], roots: string[]): Nuxt {
  for (const { path } of input) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, '');
  }
  const layers = roots.map(dir => ({
    cwd: join(dir, '../..'),
    config: { rootDir: join(dir, '../..'), srcDir: join(dir, '..') },
  }));
  const pages = toVueRouter4(buildTree(input, { roots, modes: MODES }), { attrs: { mode: MODES } });
  const app = { layouts: {}, middleware: [], pages };
  const options = {
    rootDir: join(root, 'L0'),
    srcDir: join(root, 'L0/app'),
    extensions: ['.vue', '.ts'],
    ignore: [],
    _layers: layers,
  };
  return { apps: { default: app }, options } as unknown as Nuxt;
}

/** Checks one random project: the reported pages, and the dropped pages that are not reported. */
async function check(root: string, input: PageFile[]): Promise<void> {
  const roots = Array.from({ length: LAYERS }, (_, layer) => join(root, `L${layer}`, 'app/pages/'));
  const nuxt = project(root, input, roots);
  const kept = keptFiles(input, roots);
  const { pages } = await recordShadowedFiles(nuxt, path => path);
  const context = JSON.stringify({ input, pages });
  // Each reported file is dropped, for the file in `shadowedBy` alone.
  for (const page of pages) {
    const pair = input.filter(file => file.path === page.file || file.path === page.shadowedBy);
    expect(keptFiles(pair, roots), context).toEqual(new Set([page.shadowedBy]));
    expect(kept.has(page.file), context).toBe(false);
    expect(kept.has(page.shadowedBy), context).toBe(true);
  }
  // Each file that a route file of a higher layer drops is reported, with that file.
  const given = new Set(routeFiles(nuxt.apps.default.pages ?? []));
  for (const file of input.filter(entry => !kept.has(entry.path))) {
    const winner = input.find(
      other =>
        other.priority < file.priority &&
        // The module sees only the `file` of each route, not a named view or a mode file next to it.
        given.has(other.path) &&
        !keptFiles([other, file], roots).has(file.path),
    );
    const reported = pages.find(page => page.file === file.path);
    expect(reported?.shadowedBy, context).toBe(winner?.path);
  }
}

describe('the shadowed pages, checked against the route tree of unrouting', () => {
  it('reports each page that unrouting drops for a page of a higher layer, and no other', async () => {
    const next = random(104);
    const roots = Array.from({ length: 100 }, (_, run) => join(top, String(run)));
    const cases = roots.map(root => ({ root, input: pageFiles(next, root) }));
    await Promise.all(
      cases.map(async ({ root, input }) => {
        await check(root, input);
      }),
    );
  });
});
