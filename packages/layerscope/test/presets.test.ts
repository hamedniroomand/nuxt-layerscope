import { describe, expect, it } from 'vite-plus/test';

import { resolvePreset } from '#src/config/presets.ts';
import { validateConfig } from '#src/config/validate.ts';
import { fittingPreset } from '#src/init/preset.ts';
import type { AllowedEdge } from '#src/init/types.ts';
import type { LayerscopeConfig, PresetOptions } from '#src/types.ts';

const allowOf = (preset: Parameters<typeof resolvePreset>[0], names: string[]): string[][] =>
  resolvePreset(preset, names).allow;

describe('features', () => {
  const names = ['articles', 'shop', 'ui', 'core'];

  it('lets the base layers build up and every other layer use only them', () => {
    expect(allowOf('features', names)).toEqual([['core', 'ui'], ['core', 'ui'], ['core'], []]);
  });

  it('picks the first name that exists for each base layer, in the order of the candidates', () => {
    const picked = (list: string[]): string[] => resolvePreset('features', list).base;
    expect(picked(['a', 'base', 'common', 'ui'])).toEqual(['base', 'ui']);
    expect(picked(['a', 'common', 'shared'])).toEqual(['shared']);
    expect(picked(['a', 'design-system', 'core'])).toEqual(['core', 'design-system']);
    expect(picked(['a', 'b'])).toEqual([]);
  });

  it('lets layers use nothing when there is no base layer', () => {
    expect(allowOf('features', ['a', 'b'])).toEqual([[], []]);
  });

  it('takes the base layers from the option, lowest first', () => {
    const preset: PresetOptions = { name: 'features', base: ['tokens', 'kit'] };
    expect(allowOf(preset, ['a', 'kit', 'tokens'])).toEqual([['tokens', 'kit'], ['tokens'], []]);
  });

  it('says that root cannot be a base layer', () => {
    expect(() => resolvePreset({ name: 'features', base: ['root'] }, ['a'])).toThrow(
      '"root" cannot be a base layer',
    );
  });

  it('takes an empty base to mean no base layers', () => {
    expect(allowOf({ name: 'features', base: [] }, ['a', 'core'])).toEqual([[], []]);
  });

  it('refuses a base layer that does not exist, and names the layers there are', () => {
    expect(() => resolvePreset({ name: 'features', base: ['nope'] }, ['a', 'b'])).toThrow(
      'preset "features": base layer "nope" is not a layer. Known layers: a, b',
    );
  });
});

describe('layered', () => {
  it('uses shared, as before', () => {
    expect(allowOf('layered', ['a', 'shared', 'b'])).toEqual([['shared'], [], ['shared']]);
    expect(allowOf('layered', ['a', 'b'])).toEqual([[], []]);
  });

  it('takes another base layer from the option', () => {
    const preset: PresetOptions = { name: 'layered', base: ['base'] };
    expect(allowOf(preset, ['a', 'base', 'shared'])).toEqual([['base'], [], ['base']]);
    expect(resolvePreset(preset, ['a', 'base']).base).toEqual(['base']);
  });
});

describe('stacked', () => {
  it('lets a layer use the layers below it', () => {
    expect(allowOf('stacked', ['a', 'b', 'c'])).toEqual([['b', 'c'], ['c'], []]);
    expect(resolvePreset('stacked', ['a']).base).toEqual([]);
  });
});

describe('validation of the preset', () => {
  const validate = (preset: unknown): void => {
    validateConfig({ preset } as LayerscopeConfig, 'config');
  };

  it('accepts the names and the object form', () => {
    expect(() => {
      validate('features');
      validate({ name: 'features' });
      validate({ name: 'features', base: ['a', 'b'] });
      validate({ name: 'layered', base: ['a'] });
    }).not.toThrow();
  });

  it.each([
    ['a key that is not an option', { name: 'features', bases: ['a'] }, 'unknown key "bases"'],
    ['a key that is not an option, without base', { name: 'stacked', x: 1 }, 'unknown key "x"'],
    ['a layer twice in base', { name: 'features', base: ['a', 'b', 'a'] }, 'lists "a" twice'],
    ['an unknown name', 'apps', 'unknown preset "apps"'],
    ['an unknown name in the object form', { name: 'apps' }, 'unknown preset "apps"'],
    ['an object without a name', {}, 'unknown preset undefined'],
    ['a base that is not a list', { name: 'features', base: 'a' }, 'must be an array'],
    ['a base for stacked', { name: 'stacked', base: ['a'] }, 'takes no "base" option'],
    ['two base layers for layered', { name: 'layered', base: ['a', 'b'] }, 'exactly one layer'],
    ['no base layer for layered', { name: 'layered', base: [] }, 'exactly one layer'],
  ])('refuses %s', (_label, preset, message) => {
    expect(() => {
      validate(preset);
    }).toThrow(message);
  });
});

describe('the preset that init suggests', () => {
  const edge = (from: string, to: string): AllowedEdge => ({ from, to, count: 1, example: 'x:1' });

  it('is the strictest one that allows every edge', () => {
    const edges = [edge('shop', 'shared'), edge('admin', 'shared')];
    expect(fittingPreset(edges, ['root', 'admin', 'shop', 'shared'])).toEqual({
      name: 'layered',
      base: ['shared'],
    });
  });

  it('leaves out what root uses, and counts what uses root', () => {
    const edges = [edge('root', 'shop'), edge('shop', 'shared')];
    expect(fittingPreset(edges, ['root', 'shop', 'shared'])).toEqual({
      name: 'layered',
      base: ['shared'],
    });
    expect(fittingPreset([edge('shop', 'root')], ['root', 'shop', 'shared'])).toBeNull();
  });

  it('suggests nothing when the only dependencies are those of root', () => {
    const edges = [edge('root', 'shop'), edge('root', 'shared')];
    expect(fittingPreset(edges, ['root', 'shop', 'shared'])).toBeNull();
  });

  it('suggests features with the base layers it picked', () => {
    const edges = [edge('shop', 'core'), edge('shop', 'ui'), edge('ui', 'core')];
    expect(fittingPreset(edges, ['shop', 'ui', 'core'])).toEqual({
      name: 'features',
      base: ['core', 'ui'],
    });
  });

  it('suggests stacked when layers use only the ones below them', () => {
    const edges = [edge('app', 'mid'), edge('mid', 'base'), edge('app', 'base')];
    expect(fittingPreset(edges, ['app', 'mid', 'base'])?.name).toBe('stacked');
  });

  it('suggests nothing when a dependency fits none, or when there are none', () => {
    expect(fittingPreset([edge('a', 'b'), edge('b', 'a')], ['a', 'b'])).toBeNull();
    expect(fittingPreset([], ['a', 'b'])).toBeNull();
  });
});
