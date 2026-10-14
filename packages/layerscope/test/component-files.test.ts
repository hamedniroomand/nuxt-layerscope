import { rmSync } from 'node:fs';

import { join, relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { listSymbols } from '#src/devtools/views-api.ts';
import { ProjectSession } from '#src/mcp/session.ts';
import { findUnused } from '#src/unused/index.ts';

import { CLIENT, SERVER, boundaryFindings, project, usesOf } from './component-files-project.ts';
import type { CanUseData } from './mcp-helpers.ts';
import { callTool, dataOf } from './mcp-helpers.ts';

describe('a component name with more than one file', () => {
  it.each(['export', 'interface'] as const)(
    'checks a tag against each file (%s form of the .d.ts)',
    async form => {
      const root = project({ form });
      const result = await analyze({ rootDir: root });
      expect(usesOf(result, root)).toEqual([
        ['Pair', SERVER, 'shared'],
        ['Pair', CLIENT, 'shop'],
      ]);
      expect(boundaryFindings(result)).toEqual([['auth', 'Pair', 'shop']]);
    },
  );

  it.each([
    ['a Lazy tag', '<template><LazyPair /></template>\n', 'LazyPair'],
    [
      'an import from #components',
      `<script setup lang="ts">\nimport { Pair } from '#components';\n</script>\n\n<template><component :is="Pair" /></template>\n`,
      '#components:Pair',
    ],
  ])('checks %s against each file', async (_name, user, symbol) => {
    const root = project({ user });
    const result = await analyze({ rootDir: root });
    expect(usesOf(result, root)).toEqual([
      [symbol, SERVER, 'shared'],
      [symbol, CLIENT, 'shop'],
    ]);
    expect(boundaryFindings(result)).toEqual([['auth', symbol, 'shop']]);
  });
});

describe('the files that a component name maps to', () => {
  // Nuxt uses `Pair.client.vue` and `Pair.server.vue` of `shop`, and not `Pair.vue` of `shared`.
  // The check uses each file that Nuxt keeps, so this pins the over-match that the docs give.
  it('also checks a file that Nuxt keeps but does not use for a tag', async () => {
    const shopServer = 'layers/shop/app/components/Pair.server.vue';
    const plain = 'layers/shared/app/components/Pair.vue';
    const root = project({ files: [CLIENT, shopServer, plain] });
    const result = await analyze({ rootDir: root });
    expect(usesOf(result, root)).toEqual([
      ['Pair', plain, 'shared'],
      ['Pair', CLIENT, 'shop'],
      ['Pair', shopServer, 'shop'],
    ]);
  });

  it('keeps a file once when the .d.ts lists it twice', async () => {
    const root = project({ files: [CLIENT, CLIENT] });
    const result = await analyze({ rootDir: root });
    expect(usesOf(result, root)).toEqual([['Pair', CLIENT, 'shop']]);
  });
});

describe('the readers of a component name with more than one file', () => {
  it('lists each file as unused when nothing uses the name, and neither when one file does', async () => {
    const unused = project({ user: '<template><span /></template>\n' });
    // `web` also uses `<Pair />`; without it, nothing does.
    rmSync(join(unused, 'layers/web/app/pages/web.vue'));
    const files = findUnused(await analyze({ rootDir: unused })).map(row =>
      relative(unused, row.file),
    );
    expect(files.toSorted()).toEqual([SERVER, CLIENT]);
    const used = project();
    expect(findUnused(await analyze({ rootDir: used }))).toEqual([]);
  });

  it('reports the first file when it no longer exists', async () => {
    const root = project();
    rmSync(join(root, CLIENT));
    await expect(analyze({ rootDir: root })).rejects.toThrow(
      `Generated types reference ${join(root, CLIENT)}, which no longer exists.`,
    );
  });

  it('answers can_use with the file that is not allowed', async () => {
    const root = project();
    const session = new ProjectSession({
      rootDir: root,
      source: 'auto',
      baseline: 'layerscope-baseline.json',
    });
    const auth = dataOf<CanUseData>(
      await callTool('can_use', { from: 'auth', to: 'Pair' }, session),
    );
    expect(auth).toMatchObject({
      allowed: false,
      status: 'not-allowed',
      to: { layer: 'shop', kind: 'component', symbol: 'Pair', file: CLIENT },
    });
    const web = dataOf<CanUseData>(await callTool('can_use', { from: 'web', to: 'Pair' }, session));
    expect(web).toMatchObject({ allowed: true, status: 'allowed', to: { layer: 'shop' } });
    // The first file is in `shop` itself; the second, in `shared`, is not allowed.
    const shop = dataOf<CanUseData>(
      await callTool('can_use', { from: 'shop', to: 'Pair' }, session),
    );
    expect(shop).toMatchObject({
      allowed: false,
      status: 'not-allowed',
      to: { layer: 'shared', file: SERVER },
    });
  });
});

describe('DevTools with a component name with more than one file', () => {
  it('lists the name once in DevTools, with the layer of the first file', async () => {
    const result = await analyze({ rootDir: project() });
    const pairs = listSymbols(result).filter(symbol => symbol.name === 'Pair');
    expect(pairs).toEqual([{ name: 'Pair', kind: 'component', layer: 'shop', contexts: [] }]);
  });
});
