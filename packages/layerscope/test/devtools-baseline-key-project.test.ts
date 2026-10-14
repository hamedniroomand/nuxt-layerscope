import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { sessionOptions } from '#src/devtools/index.ts';
import { writeSnapshot } from '#src/devtools/static.ts';

import { KEY, keyProject } from './baseline-key-project.ts';
import { check } from './git-project.ts';

describe('the DevTools tab and the baseline key of the config, in a project', () => {
  it('applies the file that the config names in the live tab', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    const { result } = await new Analyzer(sessionOptions(root, join(root, '.nuxt'))).get();
    expect(result.baseline?.file).toBe(join(root, KEY));
    expect(result.baseline?.suppressed).toHaveLength(1);
  });

  it('applies the file that the config names in the static snapshot', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    const publicDir = mkdtempSync(join(tmpdir(), 'layerscope-static-key-'));
    const assetsDir = mkdtempSync(join(tmpdir(), 'layerscope-client-key-'));
    writeFileSync(join(assetsDir, 'client.js'), '/* client.js */\n');
    await writeSnapshot({ rootDir: root, publicDir, base: '/__layerscope', assetsDir });
    const file = join(publicDir, '__layerscope', 'api/baseline.json');
    const view = JSON.parse(readFileSync(file, 'utf8')) as { file: string; suppressed: unknown[] };
    expect(view.file).toBe(KEY);
    expect(view.suppressed).toHaveLength(1);
  }, 60_000);
});
