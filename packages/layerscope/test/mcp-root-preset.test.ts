import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { ProjectSession } from '#src/mcp/session.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

import type { LayersData } from './mcp-helpers.ts';
import { callTool, dataOf } from './mcp-helpers.ts';
import { tempDir } from './watch-project.ts';

/** The nuxt4 fixture with another config, which `--config` reads. */
function withConfig(config: string): ProjectSession {
  const configFile = join(tempDir(), 'layerscope.config.mjs');
  writeFileSync(configFile, `export default { ${config} };\n`);
  return new ProjectSession({
    rootDir: NUXT4_ROOT,
    configFile,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
  });
}

async function rootAllow(config: string): Promise<unknown> {
  const result = dataOf<LayersData>(await callTool('layers', {}, withConfig(config)));
  return result.layers.find(layer => layer.name === 'root')?.allow;
}

describe('the layers tool with a root preset base', () => {
  it('shows root as restricted when root is in the preset base', async () => {
    expect(await rootAllow("preset: { name: 'features', base: ['root'] }")).toEqual([]);
  });

  it('shows root as unrestricted without root in the base', async () => {
    expect(await rootAllow("preset: 'features'")).toBeNull();
  });
});
