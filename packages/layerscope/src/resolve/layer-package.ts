import { pathToFileURL } from 'node:url';

import { resolveModulePath } from 'exsolve';
import { dirname, join } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import type { ImportRef } from '#src/scan/types.ts';
import type { Layer } from '#src/types.ts';
import { isGone, readJson } from '#src/utils/fs.ts';

import { LOOKUP_EXTENSIONS, resolveFile } from './file.ts';

/** The layer name for each package name of a layer, with the package name in lower case. */
export type LayerPackages = ReadonlyMap<string, string>;

/** How a file loads a module: through `require()`, and with the `type` keyword on the statement. */
export type ImportForm = Pick<ImportRef, 'require' | 'typeStatement'> & {
  /** The importing file is server code, which Nitro bundles. */
  server?: boolean;
};

/**
 * The `exports` conditions for an import of a layer. A target of `exports` cannot leave its
 * package, so each condition gives a file of the same layer. exsolve takes the first matching key
 * of the `exports` object, so when two conditions match, the order of the keys chooses the file.
 * An import uses `import` only. A `require()` uses `require` only, except in server code: Nitro
 * adds `import` to the export conditions of every preset, and `@rollup/plugin-node-resolve` uses
 * those for a `require()` too, so there the key order picks between `require` and `import`. Each
 * context gets both `browser` and `node`: app code runs in the client and in the SSR bundle, and
 * Nitro uses `browser` and not `node` for edge presets. `types` is not in the list: packages put
 * it first, and it gives a `.d.ts` file, not the source. A statement with the `type` keyword tries
 * `types` when no other condition gives a file. `development` is in the list and `production` is
 * not: layerscope reads the source, as `nuxi dev` does.
 */
const COMMON_CONDITIONS = ['module', 'node', 'browser', 'development', 'default'];

function conditionsOf(form: ImportForm, types: boolean): string[] {
  const serverImport = form.server === true ? ['import'] : [];
  const loaders = form.require === true ? ['require', ...serverImport] : ['import'];
  return [...loaders, ...COMMON_CONDITIONS, ...(types ? ['types'] : [])];
}

function resolveModule(id: string, fromFile: string, conditions: string[]): string | undefined {
  // No resolution cache, so a watch run sees a file that was added. exsolve still keeps the
  // content of each package.json until the process stops.
  return resolveModulePath(id, {
    from: pathToFileURL(fromFile),
    conditions,
    extensions: LOOKUP_EXTENSIONS,
    cache: false,
    try: true,
  });
}

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
 * Whether the package has `exports` (`exports: null` is the same as none, as in Node), or its
 * `package.json` is gone. The file is read again here, so it can have changed since exsolve read
 * it, for example while an editor writes it during a watch run. Any other read error, and a file
 * that does not hold a JSON object, stops the run.
 */
function hasExportsOrIsGone(layer: string, manifestFile: string): boolean {
  let manifest: unknown;
  try {
    manifest = readJson(manifestFile);
  } catch (error) {
    if (isGone((error as NodeJS.ErrnoException).code)) {
      return true;
    }
    throw layerManifestError(layer, manifestFile, error);
  }
  if (typeof manifest !== 'object' || manifest === null) {
    throw layerManifestError(layer, manifestFile, 'the file does not contain a JSON object');
  }
  const { exports } = manifest as { exports?: unknown };
  return exports !== undefined && exports !== null;
}

/**
 * The file of an import that starts with the package name of layer `layer`, or `null` when it
 * does not resolve. Node's rules apply first, from the importer: the `node_modules` lookup,
 * `exports` and `main`, with an added extension as Vite adds it. A package without `exports` also
 * gets the lookup of a relative path (`.js` → `.ts` and `index` files), because Nuxt layers are
 * source code and their imports leave out the extension.
 */
export function resolveLayerPackage(
  specifier: string,
  name: string,
  layer: string,
  fromFile: string,
  form: ImportForm,
): string | null {
  const resolved =
    resolveModule(specifier, fromFile, conditionsOf(form, false)) ??
    (form.typeStatement === true
      ? resolveModule(specifier, fromFile, conditionsOf(form, true))
      : undefined);
  if (resolved !== undefined) {
    return resolved;
  }
  // When the package has `exports`, `package.json` resolves only if `exports` allows it. A
  // package with `exports` gets no lookup of a relative path, and a gone file has no paths.
  const manifestFile = resolveModule(`${name}/package.json`, fromFile, conditionsOf(form, false));
  if (manifestFile === undefined || hasExportsOrIsGone(layer, manifestFile)) {
    return null;
  }
  return resolveFile(join(dirname(manifestFile), specifier.slice(name.length)));
}

/**
 * The package name of each layer: the `name` in the `package.json` at the layer root. A layer
 * without that file, or without a `name` string, has no package name. npm package names are in
 * lower case, and a file system that ignores case finds a package with any case.
 */
export function layerPackageNames(layers: Layer[]): LayerPackages {
  const names = new Map<string, string>();
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
      names.set(name.toLowerCase(), layer.name);
    }
  }
  return names;
}
