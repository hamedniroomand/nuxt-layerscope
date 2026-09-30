import { describe, expect, it } from 'vite-plus/test';

import { ruleSeverity } from '#src/config/rules.ts';
import { validateConfig } from '#src/config/validate.ts';
import { LayerscopeError } from '#src/errors.ts';
import type { LayerscopeConfig } from '#src/types.ts';

describe('config', () => {
  it('defaults layer-boundary to error and unresolved-reference to warn', () => {
    expect(ruleSeverity({}, 'layer-boundary')).toBe('error');
    expect(ruleSeverity({}, 'unresolved-reference')).toBe('warn');
  });

  it('accepts reserved rules from the spec', () => {
    expect(() => {
      validateConfig({ rules: { 'unused-symbol': 'off' } }, 'c.ts');
    }).not.toThrow();
  });

  it('rejects a layer with both path and source', () => {
    const config = { layers: { ui: { path: 'layers/ui', source: 'github:org/ui' } } };
    expect(() => {
      validateConfig(config, 'c.ts');
    }).toThrow('sets both "path" and "source"');
  });

  it('rejects invalid severities', () => {
    const config = { rules: { 'layer-boundary': 'fatal' } } as unknown as LayerscopeConfig;
    expect(() => {
      validateConfig(config, 'c.ts');
    }).toThrow(LayerscopeError);
  });

  it('rejects an unknown preset', () => {
    const config = { preset: 'flat' } as unknown as LayerscopeConfig;
    expect(() => {
      validateConfig(config, 'c.ts');
    }).toThrow('unknown preset "flat"');
  });

  it('rejects an unknown rule', () => {
    const config = { rules: { 'no-such-rule': 'error' } } as unknown as LayerscopeConfig;
    expect(() => {
      validateConfig(config, 'c.ts');
    }).toThrow('unknown rule "no-such-rule"');
  });

  it('rejects a non-array allow list', () => {
    const config = { layers: { web: { allow: 'shared' } } } as unknown as LayerscopeConfig;
    expect(() => {
      validateConfig(config, 'c.ts');
    }).toThrow('layers.web.allow must be an array');
  });
});
