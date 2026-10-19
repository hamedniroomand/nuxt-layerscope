import { fileURLToPath, pathToFileURL } from 'node:url';

import { moduleResolve } from 'import-meta-resolve';
import { dirname, join } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import type { ImportRef } from '#src/scan/types.ts';
import type { Layer } from '#src/types.ts';
import { isGone, readJson, realPath } from '#src/utils/fs.ts';

import { resolveFile } from './file.ts';

/** A layer that has a package name: its name and its root. */
export interface LayerPackage {
  name: string;
  root: string;
}

/** The layer for each package name of a layer, with the package name in lower case. */
export type LayerPackages = ReadonlyMap<string, LayerPackage>;

/** How a file loads a module: through `require()`, and with the `type` keyword on the statement. */
export type ImportForm = Pick<ImportRef, 'require' | 'typeStatement'>;

/**
 * The `exports` conditions for an import of a layer. A target of `exports` cannot leave its
 * package, so each condition gives a file of the same layer. Node takes the first matching key
 * of the `exports` object, so when two conditions match, the order of the keys chooses the file.
 * An import uses `import` only. A `require()` uses `require` and `import`, in every context: Nitro
 * adds `import` to the export conditions of every preset, and `@rollup/plugin-node-resolve` uses
 * them for a `require()` too. Nuxt copies these conditions into the Vite SSR build, and Vite adds
 * `require` for a `require()`. So for a `require()` the key order picks between the two. Each
 * context gets both `browser` and `node`: app code runs in the client and in the SSR bundle, and
 * Nitro uses `browser` and not `node` for edge presets. `types` is not in the list: packages put
 * it first, and it gives a `.d.ts` file, not the source. A statement with the `type` keyword tries
 * `types` when no other condition gives a file. `development` is in the list and `production` is
 * not: layerscope reads the source, as `nuxi dev` does.
 */
const COMMON_CONDITIONS = ['module', 'node', 'browser', 'development', 'default'];

function conditionsOf(form: ImportForm, types: boolean): string[] {
  const loaders = form.require === true ? ['require', 'import'] : ['import'];
  return [...loaders, ...COMMON_CONDITIONS, ...(types ? ['types'] : [])];
}

/**
 * The codes of an import that Node does not resolve. When the error has the `url` of the target,
 * the caller looks the target up as Vite does.
 */
const NOT_RESOLVED = new Set([
  'ERR_MODULE_NOT_FOUND',
  'ERR_UNSUPPORTED_DIR_IMPORT',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_INVALID_PACKAGE_TARGET',
  'ERR_INVALID_MODULE_SPECIFIER',
]);

function layerManifestError(layer: string, file: string, error: unknown): LayerscopeError {
  // An fs error names the path in its message, so its code is enough.
  const { code } = error as NodeJS.ErrnoException;
  const reason =
    typeof code === 'string' ? code : error instanceof Error ? error.message : String(error);
  return new LayerscopeError(
    `Cannot read the package.json of layer "${layer}" (${file}): ${reason}`,
    { cause: error },
  );
}

/**
 * The package.json that an error of the resolver is about, or `null`. The JSON error has no field
 * for it, only the message `Invalid package config <file> while importing <base>. <reason>`. An fs
 * error has `path`, with the `\\?\` of `toNamespacedPath` on Windows.
 */
export function failingManifest(error: unknown): string | null {
  const { code, path, message } = error as NodeJS.ErrnoException;
  if (code === 'ERR_INVALID_PACKAGE_CONFIG') {
    return (
      /^Invalid package config (.+?[\\/]package\.json)(?: while importing |\. |$)/u.exec(
        message,
      )?.[1] ?? null
    );
  }
  return typeof path === 'string' && /[\\/]package\.json$/u.test(path)
    ? path.replace(/^\\\\\?\\/u, '')
    : null;
}

/**
 * Node's rules, from the importer: the `node_modules` lookup, `exports` and `main`. It gives the
 * file. When the target of `exports` (or the path in a package without `exports`) is not a file,
 * it looks the target up as Vite does. Any other refusal, such as a path that `exports` does not
 * give or sets to `null`, or a package that is not found, gives `null`. The resolver keeps the
 * content of each package.json until the process stops.
 */
function lookup(
  layer: LayerPackage,
  id: string,
  fromFile: string,
  conditions: string[],
): string | null {
  // The resolver reads the subpath as a URL. `%` and `#` must stay characters of the file name.
  // A `?` query stays a query, so `?raw` is dropped, as Vite drops it.
  const specifier = id.replaceAll('%', '%25').replaceAll('#', '%23');
  try {
    return fileURLToPath(
      moduleResolve(specifier, pathToFileURL(fromFile), new Set(conditions), false),
    );
  } catch (error) {
    const { code, url } = error as NodeJS.ErrnoException & { url?: unknown };
    if (code !== undefined && NOT_RESOLVED.has(code)) {
      return typeof url === 'string' ? resolveFile(fileURLToPath(url)) : null;
    }
    // A package.json of the layer that cannot be read, that is not valid JSON, or that has an
    // invalid `exports` stops the run. The message of the resolver names the file. The resolver
    // also reads other package.json files, such as those of the importer: an error there gives
    // `null`, as before.
    const manifest = failingManifest(error);
    if (manifest === null) {
      throw error;
    }
    if (realPath(manifest) !== realPath(join(layer.root, 'package.json'))) {
      return null;
    }
    if (code === 'ERR_INVALID_PACKAGE_CONFIG') {
      throw new LayerscopeError(
        `Invalid package.json of layer "${layer.name}": ${(error as Error).message}`,
        { cause: error },
      );
    }
    throw layerManifestError(layer.name, manifest, error);
  }
}

/**
 * The file of a bare import of a package without `exports`, when Node finds no file: `main` (or
 * the package root) looked up as Vite does. The file is read again here, so it can have changed
 * since the resolver read it, for example while an editor writes it during a watch run. A gone
 * file has no paths. Any other read error, and a file that does not hold a JSON object, stops
 * the run.
 */
function mainFile(layer: LayerPackage, manifestFile: string): string | null {
  let manifest: unknown;
  try {
    manifest = readJson(manifestFile);
  } catch (error) {
    if (isGone((error as NodeJS.ErrnoException).code)) {
      return null;
    }
    throw layerManifestError(layer.name, manifestFile, error);
  }
  if (typeof manifest !== 'object' || manifest === null) {
    throw layerManifestError(layer.name, manifestFile, 'the file does not contain a JSON object');
  }
  const { exports, main } = manifest as { exports?: unknown; main?: unknown };
  // `exports: null` is the same as none, as in Node. With `exports`, Node already gave the answer.
  if (exports !== undefined && exports !== null) {
    return null;
  }
  const dir = dirname(manifestFile);
  return (typeof main === 'string' ? resolveFile(join(dir, main)) : null) ?? resolveFile(dir);
}

function resolveWith(
  specifier: string,
  name: string,
  layer: LayerPackage,
  fromFile: string,
  conditions: string[],
): string | null {
  const found = lookup(layer, specifier, fromFile, conditions);
  if (found !== null || specifier !== name) {
    return found;
  }
  const manifest = lookup(layer, `${name}/package.json`, fromFile, conditions);
  return manifest === null ? null : mainFile(layer, manifest);
}

/**
 * The file of an import that starts with the package name of layer `layer`, or `null` when it
 * does not resolve. Node's rules apply, from the importer: the `node_modules` lookup, `exports`
 * and `main`. A target that is not a file is looked up as Vite does: an added extension, `.js` →
 * `.ts` and `index` files. The extension is added to the target, not to the import, so a path
 * that `exports` sets to `null` stays refused. The caller takes the real path.
 */
export function resolveLayerPackage(
  specifier: string,
  name: string,
  layer: LayerPackage,
  fromFile: string,
  form: ImportForm,
): string | null {
  return (
    resolveWith(specifier, name, layer, fromFile, conditionsOf(form, false)) ??
    (form.typeStatement === true
      ? resolveWith(specifier, name, layer, fromFile, conditionsOf(form, true))
      : null)
  );
}

/**
 * The package name of each layer: the `name` in the `package.json` at the layer root. A layer
 * without that file, or without a `name` string, has no package name. npm package names are in
 * lower case, and a file system that ignores case finds a package with any case.
 */
export function layerPackageNames(layers: Layer[]): LayerPackages {
  const names = new Map<string, LayerPackage>();
  for (const layer of layers) {
    const file = join(layer.root, 'package.json');
    let manifest: unknown;
    try {
      manifest = readJson(file);
    } catch (error) {
      if (isGone((error as NodeJS.ErrnoException).code)) {
        continue;
      }
      throw layerManifestError(layer.name, file, error);
    }
    const name =
      typeof manifest === 'object' && manifest !== null
        ? (manifest as { name?: unknown }).name
        : undefined;
    if (typeof name === 'string' && !names.has(name.toLowerCase())) {
      names.set(name.toLowerCase(), { name: layer.name, root: layer.root });
    }
  }
  return names;
}
