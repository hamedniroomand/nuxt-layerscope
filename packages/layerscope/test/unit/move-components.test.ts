import { describe, expect, it } from 'vite-plus/test';

import { addSuggestions } from '#src/suggest/index.ts';
import type { Edge, Finding, LayerscopeConfig } from '#src/types.ts';
import { makeEdge, makeFinding, makeLayer } from '#test/factories.ts';

/**
 * `fix --apply` has no check for the component dir settings of the target (`prefix`,
 * `pathPrefix`), because the plan never has such a move: a component moves only between layers
 * that have the default component dirs. A layer that sets `components` is `defaultComponents:
 * false`. These tests keep that rule, which the apply step relies on.
 */
const FILE = '/app/web/components/BaseCard.vue';
const config: LayerscopeConfig = {
  layers: {
    web: { allow: ['shared'] },
    admin: { allow: ['shared'] },
    shop: { allow: ['shared'] },
    shared: { allow: [] },
  },
};

function layersWith(name: string): ReturnType<typeof makeLayer>[] {
  return ['admin', 'shop', 'web', 'shared'].map(layer => {
    const made = makeLayer(layer, `/app/${layer}`);
    made.defaultComponents = layer !== name;
    return made;
  });
}

const use = (fromLayer: string): Edge =>
  makeEdge({
    kind: 'component',
    symbol: 'BaseCard',
    fromLayer,
    toLayer: 'web',
    to: FILE,
    file: `/app/${fromLayer}/a.vue`,
  });

const finding = (fromLayer: string): Finding =>
  makeFinding({
    symbol: 'BaseCard',
    fromLayer,
    toLayer: 'web',
    target: FILE,
    file: `/app/${fromLayer}/a.vue`,
  });

async function action(name: string): Promise<string | undefined> {
  const [first] = await addSuggestions(
    [finding('admin'), finding('shop')],
    [use('admin'), use('shop')],
    layersWith(name),
    config,
    '/app',
  );
  return first.suggestion?.action;
}

describe('a component move and the component dirs of the layers', () => {
  it('moves a component between layers with the default component dirs', async () => {
    expect(await action('none')).toBe('move');
  });

  it('does not move it to a layer that sets its own component dirs (prefix, pathPrefix)', async () => {
    expect(await action('shared')).not.toBe('move');
  });

  it('does not move it out of a layer that sets its own component dirs', async () => {
    expect(await action('web')).not.toBe('move');
  });
});
