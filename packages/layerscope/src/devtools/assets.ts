import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { join } from 'pathe';

import { packageVersion } from '#src/version.ts';

const NAME_PATTERN = /^[\w-]+\.(?:css|js)$/u;

const TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
};

/**
 * The built client. Bundled, this module is a chunk in `dist/` next to `dist/devtools/`; from
 * source (tests, local development) it sits in `src/devtools/`.
 */
export function defaultAssetsDir(): string {
  const bundled = fileURLToPath(new URL('devtools/', import.meta.url));
  return existsSync(join(bundled, 'client.js'))
    ? bundled
    : fileURLToPath(new URL('../../dist/devtools/', import.meta.url));
}

/**
 * Tags the built client for caching: the package version plus the build time of `client.js`, so
 * a rebuild without a version bump still reaches the browser.
 */
export function assetVersion(dir: string): string {
  try {
    return `${packageVersion()}-${Math.round(statSync(join(dir, 'client.js')).mtimeMs)}`;
  } catch {
    return packageVersion();
  }
}

export interface Asset {
  body: string;
  type: string;
}

/** A client file by name, or `null` for names outside the built client, such as `../x`. */
export async function readAsset(dir: string, name: string): Promise<Asset | null> {
  if (!NAME_PATTERN.test(name)) {
    return null;
  }
  try {
    const body = await readFile(join(dir, name), 'utf8');
    return { body, type: TYPES[name.slice(name.lastIndexOf('.') + 1)] ?? 'text/plain' };
  } catch {
    return null;
  }
}
