import { existsSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';

import { dirname, isAbsolute, join, relative } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_FILE } from '#src/baseline/index.ts';
import { packageVersion } from '#src/version.ts';

import { findingKey } from './finding-keys.ts';
import { renderShell } from './shell.ts';
import { staticFiles } from './static-files.ts';
import { viewBody } from './views-api.ts';

export const MISSING_CLIENT =
  'The DevTools client is not built. Run the nuxt-layerscope build first.';

export interface SnapshotOptions {
  rootDir: string;
  /** Nitro's public output directory; the snapshot goes in its `__layerscope/` folder. */
  publicDir: string;
  /** The URL of the tab, such as `/__layerscope` or `/docs/__layerscope` under a base URL. */
  base: string;
  /** The built client: `client.js`, `client.css` and the graph chunk. */
  assetsDir: string;
}

/**
 * The snapshot is public, so no path of the build machine may stay in it: absolute paths become
 * relative to the root, and the root itself becomes ''.
 */
export function publicPaths(value: unknown, rootDir: string): unknown {
  if (typeof value === 'string') {
    if (value === rootDir) {
      return '';
    }
    return isAbsolute(value) && (value.startsWith(`${rootDir}/`) || existsSync(value))
      ? relative(rootDir, value)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(item => publicPaths(item, rootDir));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, publicPaths(item, rootDir)]),
  );
}

async function writeJson(dir: string, path: string, body: unknown, rootDir: string): Promise<void> {
  const file = join(dir, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(publicPaths(body, rootDir))}\n`);
}

/**
 * Writes the tab as static files: the shell in demo mode, the client, and one JSON file for each
 * answer the tab can ask for. Returns the written paths, relative to `__layerscope/`.
 */
export async function writeSnapshot(options: SnapshotOptions): Promise<string[]> {
  const { rootDir, publicDir, base, assetsDir } = options;
  if (!existsSync(join(assetsDir, 'client.js'))) {
    throw new Error(MISSING_CLIENT);
  }
  const started = Date.now();
  const result = await analyze({ rootDir, baseline: BASELINE_FILE });
  const keys = result.findings.map(finding => findingKey(finding, rootDir));
  const files = await staticFiles(result, {
    keys,
    analyzedAt: started,
    durationMs: Date.now() - started,
    version: packageVersion(),
    view: async (path, query) => {
      const body = await viewBody(path, result, query);
      return body;
    },
  });
  const dir = join(publicDir, '__layerscope');
  await Promise.all(
    files.map(async file => {
      await writeJson(dir, file.path, file.body, rootDir);
    }),
  );
  await cp(assetsDir, join(dir, 'assets'), { recursive: true });
  const shell = renderShell({ base, openInEditor: '', token: '', demo: true }, packageVersion());
  await writeFile(join(dir, 'index.html'), `${shell}\n`);
  return [...files.map(file => file.path), 'assets/', 'index.html'];
}
