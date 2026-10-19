import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { addSuggestions } from '#src/suggest/index.ts';
import type { Edge, Finding, LayerscopeConfig, Suggestion } from '#src/types.ts';
import { makeEdge, makeFinding, makeLayer } from '#test/factories.ts';

const config: LayerscopeConfig = {
  layers: {
    web: { allow: ['shared'] },
    admin: { allow: ['shared'] },
    shop: { allow: ['shared'] },
    shared: { allow: [] },
  },
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A project with the given Nuxt version and files, relative to the project root. */
function project(nuxt: string, files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-src-types-')));
  roots.push(root);
  write(join(root, 'node_modules/nuxt/package.json'), JSON.stringify({ version: nuxt }));
  for (const [file, text] of Object.entries(files)) {
    write(join(root, file), text);
  }
  return root;
}

/** The suggestion for `useX` in `web`, which `admin` and `shop` use as an auto-import. */
async function suggestion(root: string, file: string): Promise<Suggestion | undefined> {
  const layers = ['admin', 'shop', 'web', 'shared'].map(name =>
    makeLayer(name, join(root, 'layers', name)),
  );
  const to = join(root, file);
  const use = (fromLayer: string): Partial<Edge> & Partial<Finding> => ({
    symbol: 'useX',
    fromLayer,
    toLayer: 'web',
    file: join(root, 'layers', fromLayer, 'a.ts'),
  });
  const [first] = await addSuggestions(
    ['admin', 'shop'].map(layer => makeFinding({ ...use(layer), target: to })),
    ['admin', 'shop'].map(layer => makeEdge({ ...use(layer), to })),
    layers,
    config,
    root,
  );
  return first.suggestion;
}

const USE_X = 'export function useX() {}\n';

describe('the types dir in srcDir', () => {
  it('is an auto-import dir of the target on Nuxt 4.6, and not on Nuxt 4.5', async () => {
    const file = 'layers/web/types/useX.ts';
    const moved = await suggestion(project('4.6.0-rc.1', { [file]: USE_X }), file);
    expect(moved?.action).toBe('move');
    expect(moved?.file).toMatch(/\/layers\/shared\/types\/useX\.ts$/u);
    const kept = await suggestion(project('4.5.2', { [file]: USE_X }), file);
    expect(kept?.action).not.toBe('move');
  });

  it('gives a name conflict with a third layer on Nuxt 4.6, and not on Nuxt 4.5', async () => {
    const file = 'layers/web/composables/useX.ts';
    const files = { [file]: USE_X, 'layers/admin/types/useX.ts': USE_X };
    expect((await suggestion(project('4.6.2', files), file))?.action).not.toBe('move');
    expect((await suggestion(project('4.5.2', files), file))?.action).toBe('move');
  });
});
