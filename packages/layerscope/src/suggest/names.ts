import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { findExports, findTypeExports } from 'mlly';
import { dirname, join, parse, relative, resolve } from 'pathe';

import type { Layer } from '#src/types.ts';
import { isFile } from '#src/utils/fs.ts';

const SCRIPT = /\.(?:ts|js|mjs|mts)$/u;
const COMPONENT = /\.(?:vue|jsx|tsx)$/u;
const INDEX = /^index\.(?:ts|js|mjs|mts)$/u;
/** The file kinds that unimport reads in a dir that Nuxt scans for auto-imports. */
export const SCANNED = /\.(?:mts|cts|ts|tsx|mjs|cjs|js|jsx)$/u;
// `FileExtensionLookup` of unimport 6.5, in its order.
const STAR_EXTENSIONS = ['mts', 'cts', 'ts', 'tsx', 'mjs', 'cjs', 'js', 'jsx'];

export type DirKind = 'srcDir' | 'serverDir' | 'sharedDir';

/**
 * The dirs that Nuxt scans for auto-imports by default, in each source dir of a layer. `srcTypes`
 * is true when Nuxt also scans `types` in `srcDir` (Nuxt 4.6 and later).
 */
function autoImportDirs(srcTypes: boolean): Record<DirKind, string[]> {
  return {
    srcDir: srcTypes ? ['composables', 'utils', 'types'] : ['composables', 'utils'],
    serverDir: ['utils'],
    sharedDir: ['utils', 'types'],
  };
}

/**
 * Whether Nuxt scans a path by default. `inside` is the path in the source dir. Nuxt reads only the
 * script files at the top level of the dir. Nitro reads `server/utils` at any depth. layerscope
 * moves a file there only to the top level or to the `index` file of a sub dir.
 */
export function isAutoImported(kind: DirKind, inside: string, srcTypes: boolean): boolean {
  const parts = inside.split('/');
  if (!autoImportDirs(srcTypes)[kind].includes(parts[0])) {
    return false;
  }
  if (parts.length === 2) {
    return SCRIPT.test(parts[1]);
  }
  return kind === 'serverDir' && parts.length === 3 && INDEX.test(parts[2]);
}

function pascal(text: string): string {
  return text
    .split(/[\s._-]+/u)
    .filter(part => part !== '')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function camel(text: string): string {
  const name = pascal(text);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * The name of a component from its path in the components dir: the dirs and the file name, with a
 * repeated prefix removed (`base/BaseButton.vue` and `base/Button.vue` are both `BaseButton`).
 */
export function componentName(inside: string): string {
  const parts = inside.replace(COMPONENT, '').split('/');
  const file = parts.pop() ?? '';
  const dirs = pascal(parts.join('/'));
  if (file === 'index') {
    return dirs;
  }
  const name = pascal(file.replace(/\.(?:client|server|global)$/u, ''));
  return name.startsWith(dirs) ? name : `${dirs}${name}`;
}

export interface FileNames {
  names: string[];
  /**
   * True when the file has an `export * from` without a name whose module is not read: a package,
   * an alias, or a path whose file unimport does not find. It also comes up from a file that the
   * file re-exports with a relative `export * from`.
   */
  unknown: boolean;
}

/**
 * The file of a relative `export * from`, found as unimport 6.5 finds it: `x.<ext>` and then
 * `x/index.<ext>` for each extension in its order, and then the path as written. `null` when this
 * lookup finds nothing, and the file then counts as unknown. unimport then tries a resolve from the
 * cwd, which layerscope does not copy; unknown is the safe side.
 */
function starFile(path: string): string | null {
  for (const ext of STAR_EXTENSIONS) {
    const file = [`${path}.${ext}`, join(path, `index.${ext}`)].find(candidate =>
      isFile(candidate),
    );
    if (file !== undefined) {
      return file;
    }
  }
  return isFile(path) ? path : null;
}

/**
 * The names that a file makes public, read with mlly as unimport reads them for Nuxt: also type
 * exports, which Nuxt auto-imports too. A default export is named after the file, or after its dir
 * for an `index` file. As in unimport, only a name with `-`, `_` or `.` is changed to camelCase.
 * A relative `export * from` adds the names of that file, as in unimport. `seen` stops a cycle.
 */
export function exportedNames(file: string, seen = new Set<string>()): FileNames {
  if (seen.has(file) || !existsSync(file)) {
    return { names: [], unknown: false };
  }
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  const names: string[] = [];
  let unknown = false;
  let hasDefault = false;
  for (const entry of [...findExports(source), ...findTypeExports(source)]) {
    if (entry.type === 'star' && entry.name === undefined) {
      const spec = entry.specifier ?? '';
      const inner = spec.startsWith('.') ? starFile(resolve(dirname(file), spec)) : null;
      const nested = inner === null ? { names: [], unknown: true } : exportedNames(inner, seen);
      names.push(...nested.names);
      unknown ||= nested.unknown;
    } else {
      names.push(...entry.names);
      hasDefault ||= entry.type === 'default';
    }
  }
  if (hasDefault) {
    const { name: base, dir } = parse(file);
    const name = base === 'index' ? parse(dir).name : base;
    names.push(/[-_.]/u.test(name) ? camel(name) : name);
  }
  return { names: names.filter(name => name !== '' && name !== 'default'), unknown };
}

function listDir(dir: string): { name: string; directory: boolean }[] {
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).map(entry => ({
        name: entry.name,
        directory: entry.isDirectory(),
      }))
    : [];
}

function scriptFiles(dir: string): string[] {
  return listDir(dir)
    .filter(entry => !entry.directory && SCANNED.test(entry.name))
    .map(entry => join(dir, entry.name));
}

/** The files in the dir and in its sub dirs at any depth whose names match `pattern`. */
function filesUnder(dir: string, pattern: RegExp): string[] {
  return listDir(dir).flatMap(entry =>
    entry.directory
      ? filesUnder(join(dir, entry.name), pattern)
      : pattern.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

export interface LayerNames {
  imports: Map<string, string>;
  /**
   * True when a file in the dirs has an `export * from` a package, an alias, or a path whose file
   * unimport does not find. Its names are not read.
   */
  unknownImports: boolean;
  components: Map<string, string>;
}

/** The auto-imports and components that a layer has in the dirs that Nuxt scans by default. */
export function namesOfLayer(layer: Layer, srcTypes: boolean): LayerNames {
  const imports = new Map<string, string>();
  let unknownImports = false;
  for (const [kind, dirs] of Object.entries(autoImportDirs(srcTypes)) as [DirKind, string[]][]) {
    for (const dir of dirs) {
      // Nitro reads `server/utils` at any depth. Nuxt reads only the top level of the other dirs.
      const root = join(layer[kind], dir);
      const files = kind === 'serverDir' ? filesUnder(root, SCANNED) : scriptFiles(root);
      for (const file of files) {
        const exported = exportedNames(file);
        unknownImports ||= exported.unknown;
        for (const name of exported.names) {
          imports.set(name, file);
        }
      }
    }
  }
  const components = new Map<string, string>();
  const root = join(layer.srcDir, 'components');
  for (const file of filesUnder(root, COMPONENT)) {
    components.set(componentName(relative(root, file)), file);
  }
  return { imports, unknownImports, components };
}
