import { existsSync } from 'node:fs';

import { isAbsolute, join, resolve } from 'pathe';

import { readJson } from '#src/utils/fs.ts';

/** Alias → absolute path or bare module, longest alias first. */
export type AliasMap = [string, string][];

const TSCONFIG_FILES = [
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.server.json',
  'tsconfig.shared.json',
];

interface TsConfig {
  compilerOptions?: { paths?: Record<string, string[]> };
}

/** Nuxt's alias map, as written to the generated tsconfig files. */
export function loadAliases(buildDir: string): AliasMap {
  const map = new Map<string, string>();
  const files = TSCONFIG_FILES.map(name => join(buildDir, name)).filter(file => existsSync(file));
  for (const file of files) {
    const paths = (readJson(file) as TsConfig).compilerOptions?.paths ?? {};
    for (const [key, targets] of Object.entries(paths)) {
      const alias = key.replace(/\/\*$/u, '');
      const target = targets.at(0)?.replace(/\/\*$/u, '');
      if (target !== undefined && !map.has(alias)) {
        const isPath = isAbsolute(target) || target.startsWith('.');
        map.set(alias, isPath ? resolve(buildDir, target) : target);
      }
    }
  }
  map.set('#build', buildDir);
  return [...map].toSorted((a, b) => b[0].length - a[0].length);
}
