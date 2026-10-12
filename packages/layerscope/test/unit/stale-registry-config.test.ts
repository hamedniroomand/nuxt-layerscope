import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { loadEnvironment } from '#src/analyze/environment.ts';
import { readRegistry } from '#src/registry/read.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A build dir with the generated types of a fixture and a registry from an older release. It is a
 * sibling of the fixture's `.nuxt`, because the generated types point to files by relative path.
 */
function oldBuildDir(): string {
  const buildDir = mkdtempSync(join(NUXT4_ROOT, '.nuxt-old-'));
  created.push(buildDir);
  const nuxt = join(NUXT4_ROOT, '.nuxt');
  symlinkSync(join(nuxt, 'types'), join(buildDir, 'types'));
  symlinkSync(join(nuxt, 'components.d.ts'), join(buildDir, 'components.d.ts'));
  mkdirSync(join(buildDir, 'layerscope'));
  const layer = { name: 'root', root: NUXT4_ROOT, srcDir: join(NUXT4_ROOT, 'app') };
  const registry = { version: 1, layers: [layer], config: { rules: { 'layer-boundary': 'off' } } };
  writeFileSync(join(buildDir, REGISTRY_FILE), JSON.stringify(registry));
  return buildDir;
}

describe('a registry from an older release', () => {
  it('is stale, and keeps the options that nuxt.config set', () => {
    const read = readRegistry(oldBuildDir());
    expect(read.kind).toBe('stale');
    expect(read.kind === 'stale' && read.registry.config).toEqual({
      rules: { 'layer-boundary': 'off' },
    });
  });

  it('still applies the rules of nuxt.config when the symbols come from the .d.ts files', async () => {
    const environment = await loadEnvironment({
      rootDir: NUXT4_ROOT,
      buildDir: oldBuildDir(),
      config: {},
      source: 'auto',
    });
    expect(environment.source).toBe('types');
    expect(environment.config.rules).toEqual({ 'layer-boundary': 'off' });
  });
});
