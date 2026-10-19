import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { recordShadowedFiles } from '#src/module/shadowed-files.ts';
import { shadowedNuxt, shadowedProject } from '#test/shadowed-project.ts';

const FILES = [
  'app/pages/index.vue',
  'layers/base/app/pages/index.vue',
  'app/pages/shop/[id].vue',
  'layers/base/app/pages/shop/[id].vue',
  'app/pages/shop.vue',
];

/** The pages of Nuxt for `FILES`: `shop.vue` is the parent route of `shop/[id].vue`. */
function pagesOf(root: string): object[] {
  return [
    { path: '/', file: join(root, 'app/pages/index.vue') },
    {
      path: '/shop',
      file: join(root, 'app/pages/shop.vue'),
      children: [{ path: ':id()', file: join(root, 'app/pages/shop/[id].vue') }],
    },
  ];
}

const NO_FILES = { layouts: {}, middleware: [] };

describe('recordShadowedFiles and the pages', () => {
  it('gives each page that Nuxt does not use, with the full routes of the winner', async () => {
    const project = shadowedProject(FILES);
    const { root, base } = project;
    const nuxt = shadowedNuxt(project, { ...NO_FILES, pages: pagesOf(root) });
    const { pages } = await recordShadowedFiles(nuxt, path => path);
    expect(pages).toEqual([
      {
        name: 'index',
        file: join(base, 'app/pages/index.vue'),
        shadowedBy: join(root, 'app/pages/index.vue'),
        routes: ['/'],
      },
      {
        name: 'shop/[id]',
        file: join(base, 'app/pages/shop/[id].vue'),
        shadowedBy: join(root, 'app/pages/shop/[id].vue'),
        routes: ['/shop/:id()'],
      },
    ]);
  });

  it('gives each route of a winner file that has more than one', async () => {
    const project = shadowedProject(FILES.slice(0, 2));
    const file = join(project.root, 'app/pages/index.vue');
    const routes = [
      { path: '/', file },
      { path: '/de', file },
    ];
    const nuxt = shadowedNuxt(project, { ...NO_FILES, pages: routes });
    const [page] = (await recordShadowedFiles(nuxt, path => path)).pages;
    expect(page.routes).toEqual(['/', '/de']);
  });

  it('gives no pages when the app has none, as when the pages of Nuxt are off', async () => {
    const project = shadowedProject(FILES);
    const nuxt = shadowedNuxt(project, NO_FILES);
    expect((await recordShadowedFiles(nuxt, path => path)).pages).toEqual([]);
  });
});

describe('recordShadowedFiles and the pattern of the pages', () => {
  it('scans the pages with the pattern of the pages option', async () => {
    const project = shadowedProject(FILES);
    const app = { ...NO_FILES, pages: pagesOf(project.root) };
    const nuxt = shadowedNuxt(project, app, { pattern: ['index.vue'] });
    const { pages } = await recordShadowedFiles(nuxt, path => path);
    expect(pages.map(page => page.name)).toEqual(['index']);
  });

  it('scans every page with the default pattern when the option is a boolean', async () => {
    const project = shadowedProject(FILES);
    const app = { ...NO_FILES, pages: pagesOf(project.root) };
    const nuxt = shadowedNuxt(project, app, true);
    const { pages } = await recordShadowedFiles(nuxt, path => path);
    expect(pages.map(page => page.name)).toEqual(['index', 'shop/[id]']);
  });
});
