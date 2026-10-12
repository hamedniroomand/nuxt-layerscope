import { describe, expect, it } from 'vite-plus/test';

import { addSuggestions, rootAllowNotes } from '#src/suggest/index.ts';
import type { Finding, LayerscopeConfig } from '#src/types.ts';
import { makeFinding, makeLayer } from '#test/factories.ts';

const rootFinding = (fromLayer: string, symbol = 'useShared'): Finding =>
  makeFinding({
    fromLayer,
    toLayer: 'root',
    symbol,
    file: `/app/layers/${fromLayer}/app/pages/index.vue`,
    target: '/app/app/composables/useShared.ts',
    suggestion: { action: 'allow', message: '', impact: { fixes: 1, edges: 1 } },
  });

describe('rootAllowNotes', () => {
  it('gives one note per layer that does not list root, with its finding count', () => {
    const config: LayerscopeConfig = { layers: { admin: { allow: [] }, website: { allow: [] } } };
    const notes = rootAllowNotes(
      [rootFinding('website'), rootFinding('website', 'useOther'), rootFinding('admin')],
      config,
    );
    expect(notes).toEqual([
      '"root" is a layer too, and it is not in the allow list of "website". To let "website" use the project\'s own app/ and shared/ code, add \'root\' to its allow list (clears 2 findings).',
      '"root" is a layer too, and it is not in the allow list of "admin". To let "admin" use the project\'s own app/ and shared/ code, add \'root\' to its allow list (clears 1 finding).',
    ]);
  });

  it('gives no note for a cycle, whose suggestion is leave', () => {
    const cycle = makeFinding({
      fromLayer: 'website',
      toLayer: 'root',
      suggestion: { action: 'leave', message: '', impact: { fixes: 0 } },
    });
    expect(rootAllowNotes([cycle], { layers: { website: { allow: [] } } })).toEqual([]);
  });

  it('gives no note when the layer lists root, whole or scoped', () => {
    const findings = [rootFinding('website')];
    expect(rootAllowNotes(findings, { layers: { website: { allow: ['root'] } } })).toEqual([]);
    expect(
      rootAllowNotes(findings, {
        layers: { website: { allow: [{ layer: 'root', only: ['useShared'] }] } },
      }),
    ).toEqual([]);
  });

  it('ignores findings that do not target root', () => {
    const config: LayerscopeConfig = { layers: { website: { allow: [] } } };
    expect(
      rootAllowNotes([makeFinding({ fromLayer: 'website', toLayer: 'admin' })], config),
    ).toEqual([]);
  });
});

describe('root allow suggestion', () => {
  const layers = [makeLayer('website', '/app/layers/website'), makeLayer('root', '/app')];

  async function messageOf(config: LayerscopeConfig): Promise<string | undefined> {
    const [finding] = await addSuggestions([rootFinding('website')], [], layers, config, '/app');
    return finding.suggestion?.message;
  }

  it('explains root when the layer does not list it', async () => {
    expect(await messageOf({ layers: { website: { allow: [] } } })).toBe(
      '"root" is a layer too. To let "website" use the project\'s own app/ and shared/ code, add \'root\' to its allow list (adds 1 edge, clears 1 finding)',
    );
  });

  it('keeps the old wording when a scoped root entry exists', async () => {
    const message = await messageOf({
      layers: { website: { allow: [{ layer: 'root', only: ['useOther'] }] } },
    });
    expect(message).toBe('allow "website" to use "root" (adds 1 edge, clears 1 finding)');
  });
});

describe('root hint impact under a preset', () => {
  const layers = ['a', 'b', 'c', 'core'].map(name => makeLayer(name, `/app/layers/${name}`));
  layers.push(makeLayer('root', '/app'));

  async function impactOf(
    config: LayerscopeConfig,
    presetLayers: string[],
  ): Promise<Finding['suggestion']> {
    const [finding] = await addSuggestions(
      [rootFinding('a')],
      [],
      layers,
      config,
      '/app',
      presetLayers,
    );
    return finding.suggestion;
  }

  it('counts the layers that a base change gives root, not every layer', async () => {
    // b and c keep their own allow, so only a and core, filled by the preset, get root.
    const config: LayerscopeConfig = {
      preset: 'features',
      layers: { b: { allow: [] }, c: { allow: ['a'] } },
    };
    const suggestion = await impactOf(config, ['a', 'core']);
    expect(suggestion?.impact.edges).toBe(2);
    expect(suggestion?.message).toContain("add 'root' to the preset base");
  });

  it('counts a stacked allow list as one edge', async () => {
    const suggestion = await impactOf({ preset: 'stacked' }, ['a']);
    expect(suggestion?.impact.edges).toBe(1);
    expect(suggestion?.message).toContain('replaces its preset list');
  });
});

describe('root code that uses a feature layer, with root in the preset base', () => {
  const layers = ['root', 'website'].map(name => makeLayer(name, `/app/${name}`));
  const useOfWebsite = (): Finding =>
    makeFinding({
      fromLayer: 'root',
      toLayer: 'website',
      symbol: 'usePageSeo',
      suggestion: undefined,
    });

  async function suggestionOf(config: LayerscopeConfig): Promise<Finding['suggestion']> {
    const [finding] = await addSuggestions([useOfWebsite()], [], layers, config, '/app');
    return finding.suggestion;
  }

  it('says to move the code to root or remove the use, and does not allow root to use it', async () => {
    const suggestion = await suggestionOf({
      preset: { name: 'features', base: ['root'] },
      layers: { root: { allow: [] }, website: { allow: ['root'] } },
    });
    expect(suggestion?.action).toBe('leave');
    expect(suggestion?.message).toBe(
      'change the code: root is the base layer and may not use other layers. Move "usePageSeo" to root, or remove this use',
    );
  });

  it('keeps the normal suggestion without root in the preset base', async () => {
    const suggestion = await suggestionOf({ layers: { root: { allow: [] } } });
    expect(suggestion?.action).toBe('allow');
  });

  it('keeps the normal suggestion when the config gives root its own allow list', async () => {
    const suggestion = await suggestionOf({
      preset: { name: 'features', base: ['root'] },
      layers: { root: { allow: ['other'] } },
    });
    expect(suggestion?.action).toBe('allow');
  });
});
