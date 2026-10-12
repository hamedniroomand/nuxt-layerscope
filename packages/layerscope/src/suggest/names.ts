import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { join, relative } from 'pathe';

import type { Layer } from '#src/types.ts';

const SCRIPT = /\.(?:ts|js|mjs|mts)$/u;
const COMPONENT = /\.(?:vue|jsx|tsx)$/u;
const INDEX = /^index\.(?:ts|js|mjs|mts)$/u;

/** The dirs that Nuxt scans for auto-imports by default, in each source dir of a layer. */
export const AUTO_IMPORT_DIRS = {
  srcDir: ['composables', 'utils'],
  serverDir: ['utils'],
  sharedDir: ['utils', 'types'],
};

export type DirKind = keyof typeof AUTO_IMPORT_DIRS;

/**
 * Whether Nuxt scans a path by default. `inside` is the path in the source dir. Nuxt reads the
 * script files in the dir, and the `index` file of each sub dir. It does not read deeper.
 */
export function isAutoImported(kind: DirKind, inside: string): boolean {
  const parts = inside.split('/');
  if (!AUTO_IMPORT_DIRS[kind].includes(parts[0])) {
    return false;
  }
  if (parts.length === 2) {
    return SCRIPT.test(parts[1]);
  }
  return parts.length === 3 && INDEX.test(parts[2]);
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

const NAMED =
  /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum)\s+([\w$]+)/gu;
const LISTED = /\bexport\s*(?:type\s*)?\{([^}]*)\}/gu;

/** The names that a file makes public. A default export is named after the file. */
export function exportedNames(file: string): string[] {
  if (!existsSync(file)) {
    return [];
  }
  const source = readFileSync(file, 'utf8');
  const names = [...source.matchAll(NAMED)].map(match => match[1]);
  for (const match of source.matchAll(LISTED)) {
    for (const entry of match[1].split(',')) {
      const name =
        entry
          .trim()
          .split(/\s+as\s+/u)
          .at(-1) ?? '';
      if (name !== '' && name !== 'default') {
        names.push(name);
      }
    }
  }
  if (/\bexport\s+default\b|\bas\s+default\b/u.test(source)) {
    const parts = file.replace(SCRIPT, '').split('/');
    const last = parts.at(-1) === 'index' ? parts.at(-2) : parts.at(-1);
    names.push(camel(last ?? ''));
  }
  return names.filter(name => name !== '');
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
  return listDir(dir).flatMap(entry => {
    if (!entry.directory) {
      return SCRIPT.test(entry.name) ? [join(dir, entry.name)] : [];
    }
    return listDir(join(dir, entry.name))
      .filter(inner => !inner.directory && INDEX.test(inner.name))
      .map(inner => join(dir, entry.name, inner.name));
  });
}

function componentFiles(dir: string): string[] {
  return listDir(dir).flatMap(entry =>
    entry.directory
      ? componentFiles(join(dir, entry.name))
      : COMPONENT.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

export interface LayerNames {
  imports: Map<string, string>;
  components: Map<string, string>;
}

/** The auto-imports and components that a layer has in the dirs that Nuxt scans by default. */
export function namesOfLayer(layer: Layer): LayerNames {
  const imports = new Map<string, string>();
  for (const kind of Object.keys(AUTO_IMPORT_DIRS) as DirKind[]) {
    for (const dir of AUTO_IMPORT_DIRS[kind]) {
      for (const file of scriptFiles(join(layer[kind], dir))) {
        for (const name of exportedNames(file)) {
          imports.set(name, file);
        }
      }
    }
  }
  const components = new Map<string, string>();
  const root = join(layer.srcDir, 'components');
  for (const file of componentFiles(root)) {
    components.set(componentName(relative(root, file)), file);
  }
  return { imports, components };
}
