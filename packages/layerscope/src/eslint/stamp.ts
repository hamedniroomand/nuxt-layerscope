import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { join } from 'pathe';

import { findConfigFile } from '#src/config/load.ts';

import { DEFAULT_REGISTRY, findProjectRoot } from './project.ts';

function digest(file: string | null): string {
  return file !== null && existsSync(file)
    ? createHash('sha1').update(readFileSync(file)).digest('hex')
    : '';
}

/**
 * What layerscope's results depend on besides the linted file: the registry and the layer config.
 * ESLint's cache keys a result on the file and the ESLint config only, so this goes into the
 * config, which drops cached results when it changes. Content, not mtime: `nuxi prepare` rewrites
 * an unchanged registry.
 */
export function projectStamp(cwd: string = process.cwd()): string {
  const root = findProjectRoot(cwd);
  if (root === null) {
    return '';
  }
  const parts = [join(root, DEFAULT_REGISTRY), findConfigFile(root)].map(file => digest(file));
  return createHash('sha1').update(parts.join(':')).digest('hex');
}
