import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { findingKey } from '#src/devtools/finding-keys.ts';
import { sessionOptions } from '#src/devtools/index.ts';
import { server } from '#test/devtools-server.ts';

import { KEY, keyProject } from './baseline-key-project.ts';

describe('the DevTools tab after an edit of the config that fires no Nuxt hook', () => {
  it('writes the file that the edited config names', async () => {
    const root = keyProject();
    const options = sessionOptions(root, join(root, '.nuxt'));
    const app = await server(root, { ...options, baseline: undefined, run: undefined });
    const { id, rev, result } = await app.session.analyzer.get();
    const keys = result.findings.map(finding => findingKey(finding, result.rootDir));
    const config = join(root, 'layerscope.config.mjs');
    writeFileSync(config, readFileSync(config, 'utf8').replace(`'${KEY}'`, "'ci/other.json'"));
    const response = await app.fetch('/api/baseline/ignore', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-layerscope-token': app.session.token },
      body: JSON.stringify({ id, rev, keys }),
    });
    expect(response.status).toBe(200);
    expect(existsSync(join(root, 'ci/other.json'))).toBe(true);
    expect(existsSync(join(root, KEY))).toBe(false);
  }, 60_000);
});
