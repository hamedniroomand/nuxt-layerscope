import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { AnalysisCache, createEnvironmentCache } from '#src/analyze/cache.ts';
import { analyze } from '#src/analyze/index.ts';

const PAGE = 'layers/admin/app/pages/admin.vue';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-cache-project-')));
  write(root, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(
    root,
    'layerscope.config.mjs',
    "export default { layers: { admin: { path: 'layers/admin' } } };\n",
  );
  write(
    root,
    PAGE,
    '<script setup lang="ts">\nimport thing from "./helper";\nconsole.log(thing);\n</script>\n',
  );
  return root;
}

describe('analysis cache across file changes', () => {
  it('re-resolves imports of an unchanged file when a file is added', async () => {
    const root = project();
    const cache = new AnalysisCache();
    const before = await analyze({ rootDir: root, cache, envKey: 'k' });
    expect(before.findings.map(finding => finding.message).join('\n')).toContain('Cannot resolve');
    write(root, 'layers/admin/app/pages/helper.ts', 'export default 1;\n');
    const after = await analyze({ rootDir: root, cache, envKey: 'k' });
    expect(after.findings.map(finding => finding.message).join('\n')).not.toContain(
      'Cannot resolve',
    );
  });
});

describe('environment cache', () => {
  it('reuses the environment while the env key holds and reloads when it changes', async () => {
    const root = project();
    const cache = new AnalysisCache();
    const environment = createEnvironmentCache();
    const first = await analyze({ rootDir: root, cache, environment, envKey: 'k' });
    const same = await analyze({ rootDir: root, cache, environment, envKey: 'k' });
    expect(same.symbols).toBe(first.symbols);
    const changed = await analyze({ rootDir: root, cache, environment, envKey: 'k2' });
    expect(changed.symbols).not.toBe(first.symbols);
    expect(changed.findings).toEqual(first.findings);
  });

  it('loads a fresh environment without an env key, as the CLI does', async () => {
    const root = project();
    const environment = createEnvironmentCache();
    const first = await analyze({ rootDir: root, environment });
    const second = await analyze({ rootDir: root, environment });
    expect(second.symbols).not.toBe(first.symbols);
  });
});
