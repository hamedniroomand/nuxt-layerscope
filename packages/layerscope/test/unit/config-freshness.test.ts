import { mkdtempSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { staleConfigNote } from '#src/analyze/config-freshness.ts';

function project(configAge: number, registryAge: number): { root: string; registry: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-config-')));
  const registry = join(root, 'registry.json');
  const config = join(root, 'nuxt.config.ts');
  const now = Date.now() / 1000;
  writeFileSync(registry, '{}');
  writeFileSync(config, 'export default {};');
  utimesSync(registry, now - registryAge, now - registryAge);
  utimesSync(config, now - configAge, now - configAge);
  return { root, registry };
}

describe('staleConfigNote', () => {
  it('is quiet when the registry is newer than nuxt.config', () => {
    const { root, registry } = project(60, 10);
    expect(staleConfigNote(root, registry)).toBeNull();
  });

  it('asks for nuxi prepare when nuxt.config was edited after the registry', () => {
    const { root, registry } = project(10, 60);
    expect(staleConfigNote(root, registry)).toContain('nuxi prepare');
  });

  it('is quiet without a nuxt.config or a registry', () => {
    const { root } = project(10, 60);
    expect(staleConfigNote(root, join(root, 'missing.json'))).toBeNull();
    expect(staleConfigNote(join(root, 'nowhere'), join(root, 'registry.json'))).toBeNull();
  });
});
