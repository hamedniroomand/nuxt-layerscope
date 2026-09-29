import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { computeEnvKey } from '#src/devtools/env-key.ts';

const INPUTS = [
  'layerscope/registry.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.server.json',
  'tsconfig.shared.json',
  'types/nitro-imports.d.ts',
  'types/shared-imports.d.ts',
  'types/components.d.ts',
];

describe('computeEnvKey', () => {
  it.each(INPUTS)('changes when .nuxt/%s changes', name => {
    const root = mkdtempSync(join(tmpdir(), 'layerscope-envkey-'));
    const buildDir = join(root, '.nuxt');
    const file = join(buildDir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'a');
    const before = computeEnvKey(root, buildDir);
    writeFileSync(file, 'longer');
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(computeEnvKey(root, buildDir)).not.toBe(before);
  });
});
