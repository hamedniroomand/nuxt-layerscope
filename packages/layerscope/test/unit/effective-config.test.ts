import { describe, expect, it } from 'vite-plus/test';

import {
  effectiveConfig,
  hasProjectConfig,
  labelConfigError,
  pickProjectConfig,
} from '#src/config/effective.ts';
import { LayerscopeError } from '#src/errors.ts';
import { LayerConfigError } from '#src/layer-config-error.ts';
import type { LayerscopeConfig } from '#src/types.ts';

const recorded = { layers: { web: { allow: ['shared'] } } };

describe('effectiveConfig', () => {
  it('uses the file when nuxt.config sets nothing', () => {
    expect(effectiveConfig({ globals: ['x'] })).toEqual({ globals: ['x'] });
  });

  it('uses nuxt.config options, keeping the file buildDir', () => {
    expect(effectiveConfig({ buildDir: '.build' }, recorded)).toEqual({
      buildDir: '.build',
      ...recorded,
    });
  });

  it('rejects layers or rules in both places', () => {
    expect(() => effectiveConfig({ rules: { 'layer-boundary': 'warn' } }, recorded)).toThrow(
      LayerscopeError,
    );
  });

  it('validates nuxt.config options like a config file', () => {
    const invalid = { rules: { 'no-such-rule': 'error' } } as unknown as LayerscopeConfig;
    expect(() => effectiveConfig({}, invalid)).toThrow('nuxt.config (layerscope): unknown rule');
  });
});

describe('pickProjectConfig', () => {
  it('keeps only project keys that are set', () => {
    expect(
      pickProjectConfig({
        buildDir: '.nuxt',
        preset: 'stacked',
        rules: { 'layer-boundary': 'warn' },
      }),
    ).toEqual({ preset: 'stacked', rules: { 'layer-boundary': 'warn' } });
  });

  it('returns an empty object when nothing project-related is set', () => {
    expect(pickProjectConfig({ buildDir: '.nuxt' })).toEqual({});
    expect(hasProjectConfig({})).toBe(false);
    expect(hasProjectConfig(recorded)).toBe(true);
  });
});

describe('labelConfigError', () => {
  const error = new LayerConfigError('layers.web.allow: unknown layer "x"');

  it('names nuxt.config when its settings caused the error', () => {
    expect(labelConfigError(error, recorded)).toHaveProperty(
      'message',
      'nuxt.config (layerscope): layers.web.allow: unknown layer "x"',
    );
  });

  it('leaves errors from a config file and other errors alone', () => {
    expect(labelConfigError(error)).toBe(error);
    expect(labelConfigError(error, {})).toBe(error);
    const other = new LayerscopeError('boom');
    expect(labelConfigError(other, recorded)).toBe(other);
  });
});
