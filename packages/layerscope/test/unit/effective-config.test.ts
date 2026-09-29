import { describe, expect, it } from 'vite-plus/test';

import { effectiveConfig } from '#src/config/effective.ts';
import { LayerscopeError } from '#src/errors.ts';
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
