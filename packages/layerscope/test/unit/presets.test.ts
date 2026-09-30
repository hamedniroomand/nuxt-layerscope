import { describe, expect, it } from 'vite-plus/test';

import { applyPreset, isPreset } from '#src/config/presets.ts';
import { makeLayer } from '#test/factories.ts';

describe('isPreset', () => {
  it('accepts the known presets', () => {
    expect(isPreset('layered')).toBe(true);
    expect(isPreset('stacked')).toBe(true);
    expect(isPreset('flat')).toBe(false);
  });
});

describe('applyPreset', () => {
  const layers = [
    makeLayer('root', '/app'),
    makeLayer('web', '/app/web'),
    makeLayer('shared', '/app/shared'),
  ];

  it('leaves config alone when no preset is set', () => {
    expect(applyPreset({ rules: { 'layer-boundary': 'warn' } }, layers)).toEqual({
      rules: { 'layer-boundary': 'warn' },
    });
  });

  it('fills layered allow lists so only shared is open', () => {
    expect(applyPreset({ preset: 'layered' }, layers).layers).toEqual({
      web: { allow: ['shared'] },
      shared: { allow: [] },
    });
  });

  it('fills stacked allow lists as lower layers', () => {
    const stacked = [makeLayer('root', '/app'), makeLayer('a', '/a'), makeLayer('b', '/b')];
    expect(applyPreset({ preset: 'stacked' }, stacked).layers).toEqual({
      a: { allow: ['b'] },
      b: { allow: [] },
    });
  });

  it('keeps an explicit allow over the preset default', () => {
    expect(
      applyPreset({ preset: 'layered', layers: { web: { allow: ['shared', 'root'] } } }, layers)
        .layers?.web,
    ).toEqual({ allow: ['shared', 'root'] });
  });
});
