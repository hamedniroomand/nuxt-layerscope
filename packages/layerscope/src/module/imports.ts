import { isAbsolute, resolve } from 'pathe';

import type { Registry, RegistryImport, ShadowedFile } from '#src/registry/schema.ts';
import { resolveFile } from '#src/resolve/file.ts';
import { realPath } from '#src/utils/fs.ts';
import { compareStrings } from '#src/utils/strings.ts';

import { loadUnimport } from './import-dirs.ts';
import type { Unimport, UnimportImport } from './nuxt.ts';

// Written by hand into `shared-imports.d.ts`: available in both app and server code.
const SHARED_BUILTINS: RegistryImport[] = [
  { name: 'useRuntimeConfig', from: 'nuxt' },
  { name: 'useAppConfig', from: 'nuxt' },
  { name: 'defineAppConfig', from: 'nuxt' },
  { name: 'createError', from: 'h3' },
  { name: 'setResponseStatus', from: 'h3' },
];
const SHARED_BUILTIN_NAMES = new Set(SHARED_BUILTINS.map(entry => entry.name));

type AliasMap = Record<string, string>;

export function resolveAlias(path: string, aliases: AliasMap): string {
  const key = Object.keys(aliases)
    .toSorted((a, b) => b.length - a.length)
    .find(alias => path === alias || path.startsWith(`${alias}/`));
  return key === undefined ? path : aliases[key] + path.slice(key.length);
}

function byName<T extends { name: string }>(entries: T[]): T[] {
  return entries.toSorted((a, b) => compareStrings(a.name, b.name));
}

function importName(entry: UnimportImport): string {
  return entry.as ?? entry.name;
}

export async function activeImports(
  context: Unimport | null | undefined,
): Promise<UnimportImport[]> {
  const imports = context === null || context === undefined ? [] : await context.getImports();
  return imports.filter(entry => entry.type !== true && entry.disabled !== true);
}

/**
 * unimport never drops an entry that has one of these declaration types. A scanned file gives it
 * only to the type twin of an `enum` or a `class`: the value entry has no declaration type, and
 * unimport drops it as any other value. An entry from a preset can carry it too.
 */
const KEPT_DECLARATIONS = new Set(['enum', 'const enum', 'class']);

/** An entry that can replace another entry of the same name, or be replaced by one. */
function isValueImport(entry: UnimportImport): boolean {
  return (
    entry.type !== true &&
    entry.disabled !== true &&
    !KEPT_DECLARATIONS.has(entry.declarationType ?? '')
  );
}

/**
 * The auto-imports that unimport drops for an auto-import of the same name, each with the file or
 * the package that it uses instead. unimport keeps each entry before its dedupe in the internal
 * context, and `getImports()` gives the entries that it uses. So the winner is the real one, also
 * when two files have the same priority and the later one wins. `toFile` resolves the aliases of
 * a path. Without the internal context (an older unimport), nothing is given.
 */
export async function shadowedImports(
  context: Unimport | null,
  toFile: (path: string) => string,
): Promise<ShadowedFile[]> {
  const state = context?.getInternalContext?.();
  if (context === null || state === undefined) {
    return [];
  }
  const active = (await activeImports(context)).filter(entry => isValueImport(entry));
  const winners = new Map(active.map(entry => [importName(entry), entry]));
  const entries = [...(state.staticImports ?? []), ...(state.dynamicImports ?? [])];
  const found = new Map<string, ShadowedFile>();
  for (const entry of entries.filter(candidate => isValueImport(candidate))) {
    const name = importName(entry);
    const winner = winners.get(name);
    const file = toFile(entry.from);
    // The entry that unimport uses is not dropped, and a package is not a file of a layer.
    if (winner === undefined || winner.from === entry.from || !isAbsolute(file)) {
      continue;
    }
    // A preset or a module can give a path without an extension, for example
    // `#app/composables/fetch`: its file is found as a bundler finds it. When no file is found,
    // the import path is kept.
    const resolved = toFile(winner.from);
    const shadowedBy = resolveFile(resolved) ?? winner.from;
    // Another path of the file that unimport uses (a symbolic link) is not dropped.
    if (realPath(file) !== realPath(shadowedBy)) {
      found.set(`${name}\0${file}`, { name, file, shadowedBy });
    }
  }
  return [...found.values()].toSorted(
    (a, b) => compareStrings(a.file, b.file) || compareStrings(a.name, b.name),
  );
}

function toRegistryImports(imports: UnimportImport[], aliases: AliasMap): RegistryImport[] {
  return byName(
    imports.map(entry => {
      const from = resolveAlias(entry.from, aliases);
      return { name: importName(entry), from: isAbsolute(from) ? resolve(from) : from };
    }),
  );
}

/** The app, server and shared auto-imports, with aliases resolved, sorted by name. */
export function registryImports(
  app: UnimportImport[],
  server: UnimportImport[],
  appAliases: AliasMap,
  serverAliases: AliasMap,
): Registry['imports'] {
  // Nuxt's rule for `shared-imports.d.ts`: same name and same unresolved source in both.
  const serverFrom = new Map(server.map(entry => [importName(entry), entry.from]));
  const shared = app.filter(
    entry =>
      !SHARED_BUILTIN_NAMES.has(importName(entry)) &&
      serverFrom.get(importName(entry)) === entry.from,
  );
  return {
    app: toRegistryImports(app, appAliases),
    server: toRegistryImports(server, serverAliases),
    shared: byName([...SHARED_BUILTINS, ...toRegistryImports(shared, appAliases)]),
  };
}

/**
 * Nitro's auto-imports without the dynamic entries whose file is in `gone`, or `null` when this
 * unimport does not give what it needs. A filter on `getImports()` is not enough: it is already
 * deduped, so a stale entry can hide a live entry of the same name. So a new instance of unimport
 * gets the same options, the static imports and the other dynamic imports, and its
 * `getImports()` dedupes them in the real way. Nitro's own instance does not change.
 */
export async function importsWithout(
  context: Unimport,
  gone: Set<string>,
  rootDir: string,
): Promise<UnimportImport[] | null> {
  const state = context.getInternalContext?.();
  const loaded = await loadUnimport(rootDir);
  const create = loaded.kind === 'ok' ? loaded.unimport.createUnimport : undefined;
  if (state?.staticImports === undefined || state.dynamicImports === undefined || !create) {
    return null;
  }
  const copy = create({
    ...state.options,
    // The static imports already have the presets, and the copy does not scan.
    presets: [],
    dirs: [],
    imports: [
      ...state.staticImports,
      ...state.dynamicImports.filter(entry => !gone.has(entry.from)),
    ],
    // Nitro already warned about the same names.
    warn: () => null,
  });
  const imports = await activeImports(copy);
  return imports;
}

/**
 * Scans the Nitro dirs again and gives the imports of this scan, or `null` when this unimport has
 * no `scanImportsFromDir` (it then runs `init()`). It is the scan of `init()`, with its guard.
 */
async function scanNitroDirs(context: Unimport | undefined): Promise<UnimportImport[] | null> {
  if (context?.scanImportsFromDir === undefined) {
    await context?.init?.();
    return null;
  }
  // `init()` does not scan when the instance has no dirs.
  if (context.getInternalContext?.().options?.dirs?.length === 0) {
    return [];
  }
  const scanned = await context.scanImportsFromDir();
  return scanned;
}

/**
 * Reads Nitro's auto-imports. unimport keeps the old entries of a file that is deleted or has no
 * exports now. So `nuxi dev` would record them until it starts again. Each collect scans the
 * Nitro dirs again with Nitro's own unimport, as `init()` does, and gets the imports of this
 * scan. An entry is dropped when an earlier scan gave its file and this scan does not.
 *
 * A module entry usually comes from a file outside the dirs, so no scan gives it, and it stays.
 * A scan follows `export * from`, so it can also give a file outside the dirs. In that unusual
 * case, an entry from that file is dropped when the file leaves the scan of the dirs.
 *
 * Limit: Nitro scans the dirs when it starts, a short time before `nitro:init`. The module
 * scans them again in `nitro:init`, and Nuxt waits for that scan. A file that is deleted between
 * these two scans keeps its entry until `nuxi dev` starts again. Nitro also scans the dirs when it
 * loads again. A file that only that scan saw, and that is deleted before the next collect, also
 * keeps its entry until `nuxi dev` starts again. The stale check then reports that file.
 */
export class NitroImports {
  /** Every file that an earlier scan of the Nitro dirs gave imports from. */
  private readonly scannedFroms = new Set<string>();
  /**
   * The scan when Nitro starts under `nuxi dev`, so that the history has Nitro's first files. It
   * does not fail: a failure only loses those files.
   */
  private firstScan: Promise<unknown> = Promise.resolve();

  /**
   * Records a first scan when Nitro starts. Nuxt waits for `nitro:init`, so a file that is deleted
   * after it is in the history. A failure of this scan does not stop Nuxt or a later read. It only
   * loses the files of this scan, and each read scans again as usual.
   */
  public async start(context: Unimport | undefined): Promise<void> {
    this.firstScan = this.recordScan(context).catch(() => null);
    await this.firstScan;
  }

  public async read(context: Unimport | undefined, rootDir: string): Promise<UnimportImport[]> {
    await this.firstScan;
    const scanned = await scanNitroDirs(context);
    const imports = await activeImports(context);
    if (context === undefined || scanned === null) {
      return imports;
    }
    const gone = this.goneFiles(scanned);
    if (gone.size === 0) {
      return imports;
    }
    // Without the parts that it needs, the stale entries stay, and the stale check reports them.
    const rebuilt = await importsWithout(context, gone, rootDir);
    return rebuilt ?? imports;
  }

  /** Adds the files of a scan to the history. */
  private async recordScan(context: Unimport | undefined): Promise<void> {
    const scanned = await scanNitroDirs(context);
    this.goneFiles(scanned ?? []);
  }

  /** The files that an earlier scan gave and this scan does not. Adds this scan to the history. */
  private goneFiles(scanned: UnimportImport[]): Set<string> {
    const now = new Set(scanned.map(entry => entry.from));
    const gone = new Set([...this.scannedFroms].filter(from => !now.has(from)));
    for (const from of now) {
      this.scannedFroms.add(from);
    }
    return gone;
  }
}
