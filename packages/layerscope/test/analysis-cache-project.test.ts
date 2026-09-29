import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { AnalysisCache } from '#src/analyze/cache.ts';
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
