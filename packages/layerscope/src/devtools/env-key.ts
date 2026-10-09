import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';

import { join } from 'pathe';

/** The generated files whose content decides what the analysis sees. */
export const WATCHED = [
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

interface Stamp {
  mtimeMs: number;
  size: number;
  hash: string;
}

/** Keeps the hash of a file while its mtime and size hold, so an unchanged file is not read again. */
const stamps = new Map<string, Stamp>();

/**
 * A hash of the content, not the mtime: `nuxi dev` writes its files again with the same content,
 * and that must not drop the cache.
 */
function stamp(file: string): string {
  try {
    const { mtimeMs, size } = statSync(file);
    const known = stamps.get(file);
    if (known?.mtimeMs === mtimeMs && known.size === size) {
      return `${file}:${known.hash}`;
    }
    const hash = createHash('sha1').update(readFileSync(file)).digest('hex');
    stamps.set(file, { mtimeMs, size, hash });
    return `${file}:${hash}`;
  } catch {
    stamps.delete(file);
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
