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

  it('names the keys that are set in each place', () => {
    expect(() => effectiveConfig({ typeImports: 'ignore', globals: ['x'] }, recorded)).toThrow(
      'set both in layerscope.config ("globals", "typeImports") and in the "layerscope" key of nuxt.config ("layers")',
    );
  });

  it('validates nuxt.config options like a config file', () => {
    const invalid = { rules: { 'no-such-rule': 'error' } } as unknown as LayerscopeConfig;
    expect(() => effectiveConfig({}, invalid)).toThrow('nuxt.config (layerscope): unknown rule');
  });
});

describe('typeImports in the config', () => {
  it('takes the value from nuxt.config and keeps it in the project keys', () => {
    expect(effectiveConfig({}, { typeImports: 'ignore' })).toEqual({ typeImports: 'ignore' });
    expect(pickProjectConfig({ typeImports: 'ignore', buildDir: 'x' })).toEqual({
      typeImports: 'ignore',
    });
    expect(hasProjectConfig({ typeImports: 'check' })).toBe(true);
  });

  it('rejects a value that is not check or ignore', () => {
    const invalid = { typeImports: 'skip' } as unknown as LayerscopeConfig;
    expect(() => effectiveConfig({}, invalid)).toThrow(
      'nuxt.config (layerscope): typeImports must be "check" or "ignore", got "skip"',
    );
  });
});

describe('typeImports of another type', () => {
  it.each([[['ignore']], [true], [1]])('rejects %j', value => {
    const invalid = { typeImports: value } as unknown as LayerscopeConfig;
    expect(() => effectiveConfig({}, invalid)).toThrow('typeImports must be "check" or "ignore"');
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
