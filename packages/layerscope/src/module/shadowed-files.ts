import { getLayerDirectories, resolveFiles, runWithNuxtContext } from '@nuxt/kit';
import { extname, relative } from 'pathe';

import type { NamedFile, ShadowedFile, ShadowedPage } from '#src/registry/schema.ts';
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

type LayerDirs = ReturnType<typeof getLayerDirectories>[number];

/**
 * The scanned files that Nuxt does not use, each with the file that Nuxt uses instead. The winner
 * is the file with the same key in another layer. The same key gives the same name, so Nuxt keeps
 * only one of the two. For pages, the caller sets `name` from the key. A file with no such winner
 * is not given: then layerscope does not know why Nuxt does not use it, for example two spellings
 * of one name or two files in the same layer.
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
  pattern: string | string[],
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

type NuxtApp = Nuxt['apps'][string];
type NuxtPage = NonNullable<NuxtApp['pages']>[number];

/** The full path of a route: a child path without a leading `/` is relative to its parent. */
function joinRoute(parent: string, path: string): string {
  if (path.startsWith('/')) {
    return path;
  }
  if (path === '') {
    return parent;
  }
  return `${parent.endsWith('/') ? parent : `${parent}/`}${path}`;
}

/** The full paths of the routes of each file in the pages of Nuxt, also of the nested routes. */
function routesByFile(
  pages: NuxtPage[],
  toFile: (path: string) => string,
  parent = '/',
  routes = new Map<string, Set<string>>(),
): Map<string, Set<string>> {
  for (const page of pages) {
    const path = joinRoute(parent, page.path);
    if (page.file !== undefined) {
      const file = toFile(page.file);
      const paths = routes.get(file) ?? new Set<string>();
      paths.add(path);
      routes.set(file, paths);
    }
    routesByFile(page.children ?? [], toFile, path, routes);
  }
  return routes;
}

/** The glob of the pages module of Nuxt: the `pattern` of the `pages` option, if it has one. */
function pagesPattern(nuxt: Nuxt, extensions: string): string | string[] {
  const { pages } = nuxt.options;
  return typeof pages === 'object' && pages.pattern !== undefined
    ? pages.pattern
    : `**/*{${extensions}}`;
}

/**
 * The pages that a file with the same path in the pages dir of another layer replaces. The name
 * of an entry is the path of its file in the pages dir, without the extension: one file can give
 * more than one route, and a route path can come from `definePageMeta`.
 */
async function shadowedPages(
  nuxt: Nuxt,
  pages: NuxtPage[],
  toFile: (path: string) => string,
  extensions: string,
): Promise<ShadowedPage[]> {
  const scanned = await scanLayers(nuxt, dirs => dirs.appPages, pagesPattern(nuxt, extensions));
  const routes = routesByFile(pages, toFile);
  const keys = new Map(scanned.map(entry => [entry.file, entry.key]));
  const winners = [...routes.keys()].map(file => ({ name: '', file }));
  return shadowedFiles(scanned, winners).map(entry => ({
    name: keys.get(entry.file) ?? entry.name,
    file: entry.file,
    shadowedBy: entry.shadowedBy,
    routes: [...(routes.get(entry.shadowedBy) ?? [])].toSorted(),
  }));
}

type ResolvedApp = Partial<NuxtApp> & Pick<NuxtApp, 'layouts' | 'middleware'>;

/** The app of Nuxt, when Nuxt gave it its layouts and its middleware; else `null`. */
function resolvedApp(nuxt: Nuxt): ResolvedApp | null {
  // Nuxt adds the app when the build starts.
  if (!Object.hasOwn(nuxt.apps, 'default')) {
    return null;
  }
  // `createApp()` of Nuxt gives an app without layouts and middleware, and the first
  // `resolveApp()` adds them. Without them, the module records nothing.
  const app: Partial<NuxtApp> = nuxt.apps.default;
  return app.layouts === undefined || app.middleware === undefined ? null : (app as ResolvedApp);
}

function layoutsOf(app: ResolvedApp, toFile: (path: string) => string): NamedFile[] {
  return Object.values(app.layouts).map(layout => ({
    name: layout.name,
    file: toFile(layout.file),
  }));
}

function middlewareOf(
  middleware: NuxtApp['middleware'],
  toFile: (path: string) => string,
): NamedFile[] {
  return middleware.map(entry => ({ name: entry.name, file: toFile(entry.path) }));
}

/**
 * The layouts and the named route middleware that Nuxt uses, each with its name. Nuxt keeps one
 * file for each name. A page cannot name a global middleware: Nuxt does not add it to the named
 * middleware, so it is not in the list.
 */
export function recordNamedFiles(
  nuxt: Nuxt,
  toFile: (path: string) => string,
): { layouts: NamedFile[]; middleware: NamedFile[] } {
  const app = resolvedApp(nuxt);
  if (app === null) {
    return { layouts: [], middleware: [] };
  }
  return {
    layouts: layoutsOf(app, toFile),
    middleware: middlewareOf(
      app.middleware.filter(entry => entry.global !== true),
      toFile,
    ),
  };
}

/**
 * The layouts, the route middleware and the pages that a file of the same name in another layer
 * replaces. Nuxt keeps only the winners in `nuxt.apps.default`, so the module scans the dirs again
 * with the globs of Nuxt. `toFile` resolves the aliases of a path that Nuxt gives.
 */
export async function recordShadowedFiles(
  nuxt: Nuxt,
  toFile: (path: string) => string,
): Promise<{ layouts: ShadowedFile[]; middleware: ShadowedFile[]; pages: ShadowedPage[] }> {
  const app = resolvedApp(nuxt);
  if (app === null) {
    return { layouts: [], middleware: [], pages: [] };
  }
  const extensions = nuxt.options.extensions.join(',');
  // The app has no pages when the pages of Nuxt are off, or before Nuxt resolves them.
  const pages = app.pages === undefined ? [] : shadowedPages(nuxt, app.pages, toFile, extensions);
  const [layoutFiles, middlewareFiles, pageEntries] = await Promise.all([
    scanLayers(nuxt, dirs => dirs.appLayouts, `**/*{${extensions}}`),
    // Nuxt also scans the `*/index` files of the dir, but it gives them no name and does not use
    // them. So they cannot win or lose.
    scanLayers(nuxt, dirs => dirs.appMiddleware, `*{${extensions}}`),
    pages,
  ]);
  return {
    layouts: shadowedFiles(layoutFiles, layoutsOf(app, toFile)),
    // A global middleware also takes its name, so it is a winner too.
    middleware: shadowedFiles(middlewareFiles, middlewareOf(app.middleware, toFile)),
    pages: pageEntries,
  };
}
