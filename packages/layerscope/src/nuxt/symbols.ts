import { existsSync, readFileSync } from 'node:fs';

import { dirname, isAbsolute, join, resolve } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import { resolveFile } from '#src/resolve/file.ts';
import { packageName } from '#src/resolve/package-name.ts';
import type { Context } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

export interface SymbolTarget {
  /** Source file, when there is one; a layer that owns it wins over `module`. */
  file: string | null;
  /** Package or virtual module, used when no layer owns `file`. */
  module: string | null;
}

export type SymbolMap = Map<string, SymbolTarget>;

export interface SymbolTable {
  imports: Record<Context, SymbolMap>;
  components: SymbolMap;
}

// `  const useCart: typeof import('../../layers/web/app/composables/useCart').useCart`
const GLOBAL_CONST = /^ {2}const ([\w$]+): (.*)$/u;
// `export const BaseButton: typeof import("../components/BaseButton.vue")['default']`
const EXPORT_CONST = /^export const ([\w$]+): (.*)$/u;
// `  BaseButton: typeof import("../../components/BaseButton.vue")['default']`
const INTERFACE_MEMBER = /^ {2}([\w$]+): (.*)$/u;
const TYPEOF_IMPORT = /typeof import\((['"])(.+?)\1\)/u;
// Inline Nuxt types such as `useRuntimeConfig: (event?) => ...` have no source file.
const INLINE_TYPE: SymbolTarget = { file: null, module: 'nuxt' };

/** Target of an absolute path or a bare module specifier. */
export function targetOf(source: string, buildDir: string): SymbolTarget {
  if (!isAbsolute(source)) {
    return { file: null, module: packageName(source) };
  }
  if (source === buildDir || source.startsWith(`${buildDir}/`)) {
    return { file: null, module: '#build' };
  }
  if (source.includes('/node_modules/')) {
    // Layers installed from npm live here too, so keep the file for the owner lookup.
    const file = resolveFile(source);
    return { file: file === null ? null : realPath(file), module: packageName(source) };
  }
  return { file: realPath(resolveFile(source) ?? source), module: null };
}

function toTarget(declaration: string, fromDir: string, buildDir: string): SymbolTarget {
  const specifier = TYPEOF_IMPORT.exec(declaration)?.[2];
  if (specifier === undefined) {
    return INLINE_TYPE;
  }
  const isPath = specifier.startsWith('.') || specifier.startsWith('/');
  return targetOf(isPath ? resolve(fromDir, specifier) : specifier, buildDir);
}

/** Only `declare global { ... }` blocks hold auto-imports; the rest are type augmentations. */
function parseGlobalDeclarations(file: string, buildDir: string): SymbolMap {
  const table: SymbolMap = new Map();
  if (!existsSync(file)) {
    return table;
  }
  let inGlobal = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('declare global') || line.startsWith('}')) {
      inGlobal = line.startsWith('declare global');
      continue;
    }
    const match = inGlobal ? GLOBAL_CONST.exec(line) : null;
    if (match) {
      table.set(match[1], toTarget(match[2], dirname(file), buildDir));
    }
  }
  return table;
}

/** `.nuxt/components.d.ts`: one `export const` per component. */
export function parseComponentExports(file: string, buildDir: string): SymbolMap {
  const table: SymbolMap = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = EXPORT_CONST.exec(line);
    // Skips `componentNames: string[]`, which is not a component.
    if (match && TYPEOF_IMPORT.test(match[2])) {
      table.set(match[1], toTarget(match[2], dirname(file), buildDir));
    }
  }
  return table;
}

/** `.nuxt/types/components.d.ts` (Nuxt 4.1+): members of `interface _GlobalComponents`. */
export function parseComponentInterface(file: string, buildDir: string): SymbolMap {
  const table: SymbolMap = new Map();
  let inInterface = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('interface _GlobalComponents') || line.startsWith('}')) {
      inInterface = line.startsWith('interface _GlobalComponents');
      continue;
    }
    const match = inInterface ? INTERFACE_MEMBER.exec(line) : null;
    if (match && TYPEOF_IMPORT.test(match[2])) {
      table.set(match[1], toTarget(match[2], dirname(file), buildDir));
    }
  }
  return table;
}

function loadComponents(buildDir: string): SymbolMap | null {
  const root = join(buildDir, 'components.d.ts');
  if (existsSync(root)) {
    return parseComponentExports(root, buildDir);
  }
  const types = join(buildDir, 'types/components.d.ts');
  return existsSync(types) ? parseComponentInterface(types, buildDir) : null;
}

function sameTarget(a: SymbolTarget, b: SymbolTarget): boolean {
  return a.file === b.file && a.module === b.module;
}

/**
 * Nuxt 3 writes no `shared-imports.d.ts`; Nuxt 4 derives it from the imports both contexts
 * share, so the same rule applies here.
 */
function loadSharedImports(buildDir: string, app: SymbolMap, server: SymbolMap): SymbolMap {
  const file = join(buildDir, 'types/shared-imports.d.ts');
  if (existsSync(file)) {
    return parseGlobalDeclarations(file, buildDir);
  }
  return new Map(
    [...app].filter(([name, target]) => {
      const other = server.get(name);
      return other !== undefined && sameTarget(target, other);
    }),
  );
}

export function loadSymbolTable(buildDir: string): SymbolTable {
  const app = join(buildDir, 'types/imports.d.ts');
  const components = existsSync(app) ? loadComponents(buildDir) : null;
  if (components === null) {
    const missing = existsSync(app) ? join(buildDir, 'components.d.ts') : app;
    throw new LayerscopeError(`${missing} not found. Run "nuxi prepare" first, or pass --prepare.`);
  }
  const appImports = parseGlobalDeclarations(app, buildDir);
  const serverImports = parseGlobalDeclarations(
    join(buildDir, 'types/nitro-imports.d.ts'),
    buildDir,
  );
  return {
    imports: {
      app: appImports,
      server: serverImports,
      shared: loadSharedImports(buildDir, appImports, serverImports),
    },
    components,
  };
}
