import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { loadProject } from '#src/eslint/load-project.ts';
import type { Registry } from '#src/registry/schema.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { createProject } from '#test/eslint-project.ts';

function withLayers(registryFile: string, edit: (layer: Record<string, unknown>) => void): void {
  const registry = JSON.parse(readFileSync(registryFile, 'utf8')) as Registry;
  for (const layer of registry.layers) {
    edit(layer as unknown as Record<string, unknown>);
  }
  writeFileSync(registryFile, JSON.stringify(registry));
}

describe('loadProject with a registry from an older release', () => {
  it('loads a registry that has modulesDir and publicDir', () => {
    const { dir } = createProject();
    expect(loadProject(dir).ok).toBe(true);
  });

  it.each(['modulesDir', 'publicDir'])('does not load a layer without %s', field => {
    const { dir, registryFile } = createProject();
    withLayers(registryFile, layer => {
      Reflect.deleteProperty(layer, field);
    });
    const load = loadProject(dir);
    expect(load.ok ? '' : load.message).toContain('run "nuxi prepare"');
  });

  it('does not load a registry file that has no layers list', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-stale-')));
    mkdirSync(join(dir, '.nuxt/layerscope'), { recursive: true });
    writeFileSync(join(dir, '.nuxt', REGISTRY_FILE), JSON.stringify({ version: 1 }));
    expect(loadProject(dir).ok).toBe(false);
  });
});
