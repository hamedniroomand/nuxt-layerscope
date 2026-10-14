import { isBuiltin } from 'node:module';

import { dirname, isAbsolute, join, resolve } from 'pathe';

import type { AliasMap } from '#src/nuxt/aliases.ts';
import { isFile, readJson, realPath } from '#src/utils/fs.ts';

import { resolveFile } from './file.ts';
import type { ImportForm, LayerPackages } from './layer-package.ts';
import { resolveLayerPackage } from './layer-package.ts';
import { packageName } from './package-name.ts';

export type Resolution =
  /** `module` names the package of a file under node_modules, used when no layer owns it. */
  | { kind: 'file'; file: string; module: string | null }
  | { kind: 'external'; module: string }
  | { kind: 'missing' };

function isRelative(specifier: string): boolean {
  return /^\.\.?(?:\/|$)/u.test(specifier);
}

function resolvePath(path: string, buildDir: string): Resolution {
  if (path === buildDir || path.startsWith(`${buildDir}/`)) {
    return { kind: 'external', module: '#build' };
  }
  const file = resolveFile(path);
  if (file === null) {
    return { kind: 'missing' };
  }
  // Layers installed from npm live under node_modules, so ownership is decided later.
  const module = file.includes('/node_modules/') ? packageName(file) : null;
  return { kind: 'file', file: realPath(file), module };
}

function resolveAlias(specifier: string, aliases: AliasMap, buildDir: string): Resolution | null {
  const match = aliases.find(([alias]) => specifier === alias || specifier.startsWith(`${alias}/`));
  if (match === undefined) {
    return null;
  }
  const [alias, target] = match;
  const path = target + specifier.slice(alias.length);
  if (!isAbsolute(target)) {
    return { kind: 'external', module: packageName(path) };
  }
  const resolution = resolvePath(path, buildDir);
  // Nuxt's `typescript.hoist` aliases `ofetch`, `consola`, `h3` and others to their package dir,
  // whose entry point comes from package.json, so no file matches it.
  const manifest = join(target, 'package.json');
  if (resolution.kind !== 'missing' || !isFile(manifest)) {
    return resolution;
  }
  const { name } = readJson(manifest) as { name?: string };
  return { kind: 'external', module: name ?? packageName(target) };
}

export function resolveSpecifier(
  specifier: string,
  fromFile: string,
  aliases: AliasMap,
  buildDir: string,
  layerPackages: LayerPackages,
  /** How the file loads the module, which picks the `exports` conditions of a layer. */
  form: ImportForm = {},
): Resolution {
  if (isRelative(specifier)) {
    return resolvePath(resolve(dirname(fromFile), specifier), buildDir);
  }
  if (isAbsolute(specifier)) {
    return resolvePath(specifier, buildDir);
  }
  const aliased = resolveAlias(specifier, aliases, buildDir);
  if (aliased !== null) {
    return aliased;
  }
  // Unaliased `#app`, `#internal/...` and `virtual:x` ids are Nuxt/Nitro/Vite virtual modules.
  if (specifier.startsWith('#') || specifier.includes(':')) {
    return { kind: 'external', module: specifier.split('/')[0] };
  }
  const name = packageName(specifier);
  // The name tells that the import goes to a layer, so it is checked like a path. A Node builtin
  // such as `events` wins over a layer with the same name, as in Node.
  const layer = isBuiltin(specifier) ? undefined : layerPackages.get(name.toLowerCase());
  if (layer !== undefined) {
    const file = resolveLayerPackage(specifier, name, layer, fromFile, form);
    return file === null ? { kind: 'missing' } : resolvePath(file, buildDir);
  }
  return { kind: 'external', module: name };
}
