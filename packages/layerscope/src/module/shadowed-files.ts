import { getLayerDirectories, resolveFiles, runWithNuxtContext } from '@nuxt/kit';
import { extname, relative } from 'pathe';

import type { ShadowedFile } from '#src/registry/schema.ts';
import { realPath } from '#src/utils/fs.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { Nuxt } from './nuxt.ts';

/** A file that the scan of a dir of a layer found. */
export interface LayerFile {
  /** The index of the layer in `_layers`, highest priority first. */
  layer: number;
  file: string;
  /** The path relative to the dir of the layer, without the extension. */
  key: string;
}

/** A file that Nuxt uses, with the name that Nuxt gives it. */
export interface NamedFile {
  name: string;
  file: string;
}

type LayerDirs = ReturnType<typeof getLayerDirectories>[number];

/**
 * The scanned files that Nuxt does not use, each with the file that Nuxt uses instead. The winner
 * is the file with the same key in another layer. The same key gives the same name, so Nuxt keeps
 * only one of the two. A file with no such winner is not given: then layerscope does not know why
 * Nuxt does not use it, for example two spellings of one name or two files in the same layer.
 */
export function shadowedFiles(scanned: LayerFile[], winners: NamedFile[]): ShadowedFile[] {
  const winnerByFile = new Map(winners.map(winner => [winner.file, winner]));
  const winnerByKey = new Map<string, LayerFile & { name: string }>();
  for (const entry of scanned) {
    const winner = winnerByFile.get(entry.file);
    if (winner !== undefined && !winnerByKey.has(entry.key)) {
      winnerByKey.set(entry.key, { ...entry, name: winner.name });
    }
  }
  const shadowed = scanned.flatMap(entry => {
    const winner = winnerByKey.get(entry.key);
    if (
      winnerByFile.has(entry.file) ||
      winner === undefined ||
      // Nuxt uses the file of the layer with the highest priority, which has the lowest index. A
      // winner of the same or a lower layer means that the scan and the data of Nuxt disagree, for
      // example a file added under `nuxi dev` before Nuxt resolves the app again.
      winner.layer >= entry.layer ||
      // A symbolic link and its target are one file.
      realPath(winner.file) === realPath(entry.file)
    ) {
      return [];
    }
    return [{ name: winner.name, file: entry.file, shadowedBy: winner.file }];
  });
  return shadowed.toSorted((a, b) => compareStrings(a.file, b.file));
}

function keyOf(dir: string, file: string): string {
  const path = relative(dir, file);
  return path.slice(0, path.length - extname(path).length);
}

/** The files of one dir of each layer, with the scan and the ignore rules of Nuxt. */
async function scanLayers(
  nuxt: Nuxt,
  dirOf: (dirs: LayerDirs) => string,
  pattern: string,
): Promise<LayerFile[]> {
  const dirs = getLayerDirectories(nuxt).map(entry => dirOf(entry));
  // `resolveFiles()` reads Nuxt from the context for the ignore rules.
  const found = await runWithNuxtContext(nuxt, async () => {
    const files = await Promise.all(
      dirs.map(async dir => {
        const matched = await resolveFiles(dir, pattern);
        return matched;
      }),
    );
    return files;
  });
  return found.flatMap((files, layer) =>
    files.map(file => ({ layer, file, key: keyOf(dirs[layer] ?? '', file) })),
  );
}

/**
 * The layouts and the route middleware that a file of the same name in another layer replaces.
 * Nuxt keeps only the winners in `nuxt.apps.default`, so the module scans the dirs again with the
 * globs of Nuxt. `toFile` resolves the aliases of a path that Nuxt gives.
 */
export async function recordShadowedFiles(
  nuxt: Nuxt,
  toFile: (path: string) => string,
): Promise<{ layouts: ShadowedFile[]; middleware: ShadowedFile[] }> {
  // Nuxt adds the app when the build starts.
  if (!Object.hasOwn(nuxt.apps, 'default')) {
    return { layouts: [], middleware: [] };
  }
  // `createApp()` of Nuxt gives an app without layouts and middleware, and the first
  // `resolveApp()` adds them. Without them, the module records nothing.
  const app: Partial<typeof nuxt.apps.default> = nuxt.apps.default;
  if (app.layouts === undefined || app.middleware === undefined) {
    return { layouts: [], middleware: [] };
  }
  const extensions = nuxt.options.extensions.join(',');
  const [layoutFiles, middlewareFiles] = await Promise.all([
    scanLayers(nuxt, dirs => dirs.appLayouts, `**/*{${extensions}}`),
    // Nuxt also scans the `*/index` files of the dir, but it gives them no name and does not use
    // them. So they cannot win or lose.
    scanLayers(nuxt, dirs => dirs.appMiddleware, `*{${extensions}}`),
  ]);
  const layouts = Object.values(app.layouts).map(layout => ({
    name: layout.name,
    file: toFile(layout.file),
  }));
  const middleware = app.middleware.map(entry => ({ name: entry.name, file: toFile(entry.path) }));
  return {
    layouts: shadowedFiles(layoutFiles, layouts),
    middleware: shadowedFiles(middlewareFiles, middleware),
  };
}
