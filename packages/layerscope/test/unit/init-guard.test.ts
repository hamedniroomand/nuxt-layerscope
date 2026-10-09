import { describe, expect, it } from 'vite-plus/test';

import { assertNoNuxtConfigLayers, assertWritable } from '#src/init/guard.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { project, tempDir, write } from '#test/watch-project.ts';

describe('assertWritable', () => {
  it('accepts a project without a config and without a baseline', () => {
    expect(() => {
      assertWritable(tempDir(), undefined, true);
    }).not.toThrow();
  });

  it('refuses a project that has a config', () => {
    expect(() => {
      assertWritable(project(1), undefined, false);
    }).toThrow('already exists');
  });

  it('refuses a baseline that exists, only when it would be written', () => {
    const root = tempDir();
    write(root, 'layerscope-baseline.json', '{}');
    expect(() => {
      assertWritable(root, undefined, false);
    }).not.toThrow();
    expect(() => {
      assertWritable(root, undefined, true);
    }).toThrow('layerscope-baseline.json already exists');
  });
});

describe('assertNoNuxtConfigLayers', () => {
  const withLayers = {
    config: { layers: { a: { path: 'layers/a' } } },
  } as unknown as AnalyzeResult;

  it('refuses layers in the nuxt.config key when there is no config file', () => {
    expect(() => {
      assertNoNuxtConfigLayers(withLayers, false);
    }).toThrow('already set in the "layerscope" key of nuxt.config');
  });

  it('accepts them when there is a config file', () => {
    expect(() => {
      assertNoNuxtConfigLayers(withLayers, true);
    }).not.toThrow();
  });
});
