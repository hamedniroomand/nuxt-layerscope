import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { assertNoNuxtConfigLayers, assertWritable } from '#src/init/guard.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';
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

/** The message of the refusal, or an empty text when there is none. */
function refusalOf(result: AnalyzeResult): string {
  try {
    assertNoNuxtConfigLayers(result, false);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('assertNoNuxtConfigLayers', () => {
  const withLayers = {
    config: { layers: { a: { path: 'layers/a' } } },
  } as unknown as AnalyzeResult;

  it('refuses layers in the nuxt.config key when there is no config file', () => {
    expect(() => {
      assertNoNuxtConfigLayers(withLayers, false);
    }).toThrow('"layers" is set in the "layerscope" key of nuxt.config');
  });

  it('names only the keys that are set, and says to run init --prepare', () => {
    const onlyPreset = { config: { preset: 'layered' } } as unknown as AnalyzeResult;
    const message = refusalOf(onlyPreset);
    expect(message).toContain('"preset" is set');
    expect(message).not.toContain('"layers"');
    expect(message).toContain('then run init --prepare');
  });

  it('names only preset after a real analysis, where the preset adds its own layers', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT, config: { preset: 'layered' } });
    // The applied config has `layers` too, which the user did not set.
    expect(result.config.layers).toBeDefined();
    const message = refusalOf(result);
    expect(message).toContain('"preset" is set');
    expect(message).not.toContain('"layers"');
  });

  it('uses the plural for several keys', () => {
    const both = {
      config: { layers: {}, rules: {} },
    } as unknown as AnalyzeResult;
    expect(() => {
      assertNoNuxtConfigLayers(both, false);
    }).toThrow('"layers", "rules" are set');
  });

  it('accepts them when there is a config file', () => {
    expect(() => {
      assertNoNuxtConfigLayers(withLayers, true);
    }).not.toThrow();
  });
});
