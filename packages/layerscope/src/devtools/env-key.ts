import { readdirSync, statSync } from 'node:fs';

import { join } from 'pathe';

const WATCHED = [
  'layerscope/registry.json',
  'imports.d.ts',
  'components.d.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.server.json',
  'tsconfig.shared.json',
  'types/imports.d.ts',
  'types/nitro-imports.d.ts',
  'types/shared-imports.d.ts',
  'types/components.d.ts',
];
const CONFIG_PATTERN = /^(nuxt|layerscope)\.config\./u;

function stamp(file: string): string {
  try {
    const { mtimeMs, size } = statSync(file);
    return `${file}:${mtimeMs}:${size}`;
  } catch {
    return `${file}:missing`;
  }
}

/** Changes when the registry, generated types or config change, which invalidates cached analyses. */
export function computeEnvKey(rootDir: string, buildDir: string): string {
  const configs = readdirSync(rootDir).filter(name => CONFIG_PATTERN.test(name));
  return [
    ...WATCHED.map(name => stamp(join(buildDir, name))),
    ...configs.map(name => stamp(join(rootDir, name))),
  ].join('|');
}
