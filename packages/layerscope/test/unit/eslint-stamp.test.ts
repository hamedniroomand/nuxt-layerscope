import { mkdtempSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { projectStamp } from '#src/eslint/stamp.ts';
import { createProject } from '#test/eslint-project.ts';

describe('projectStamp', () => {
  it('follows the content of the registry and the layer config, not their mtime', () => {
    const { dir, registryFile } = createProject();
    const before = projectStamp(dir);
    const later = new Date(Date.now() + 60_000);
    utimesSync(registryFile, later, later);
    expect(projectStamp(dir)).toBe(before);
    writeFileSync(join(dir, 'layerscope.config.ts'), 'export default {};');
    expect(projectStamp(dir)).not.toBe(before);
  });

  it('is empty outside a Nuxt project', () => {
    expect(projectStamp(realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-none-'))))).toBe('');
  });
});
