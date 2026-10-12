import { pathToFileURL } from 'node:url';

import { resolveModule, useLogger } from '@nuxt/kit';
import { join, resolve } from 'pathe';

import { globImportFiles } from '#src/registry/import-files.ts';
import type { RegistryImportDir } from '#src/registry/schema.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { Nitro } from './nuxt.ts';

/** A dir of an auto-import scan: a path or a glob, or an object that also sets `types`. */
export type ScanDir = string | { glob: string; types?: boolean };

/** The options of a scan, as Nitro gives them to unimport (`dirsScanOptions`). */
export interface ScanOptions {
  cwd?: string;
  filePatterns?: string[];
}

/** The part of unimport that makes the globs of a scan. It is the code of the real scan. */
export interface UnimportScan {
  normalizeScanDirs: (dirs: ScanDir[], options?: ScanOptions) => { glob: string }[];
}

export interface ImportScan {
  dirs: ScanDir[];
  options?: ScanOptions;
}

export type UnimportLoad =
  | { kind: 'ok'; unimport: UnimportScan }
  /** The scan code of unimport is not there or not usable. `cause` says why. */
  | { kind: 'failed'; cause: string };

export function unimportWarning(cause: string): string {
  return `nuxt-layerscope could not read the auto-import dirs of Nuxt (${cause}), so the stale check does not find new auto-import files.`;
}

function isNotFound(error: unknown): boolean {
  const { code } = error as NodeJS.ErrnoException;
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
}

function causeOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The unimport that Nuxt itself uses, found from the `nuxt` package of the project. Every problem
 * is a `failed` result and never a throw: this feature must not stop `nuxi prepare`, `dev` or
 * `build`. An older unimport has no `normalizeScanDirs`.
 */
export async function loadUnimport(rootDir: string): Promise<UnimportLoad> {
  let path: string;
  try {
    // The URL is the base of the lookup. It points at a file, as the lookup needs.
    const nuxt = resolveModule('nuxt', { url: pathToFileURL(join(rootDir, 'package.json')) });
    path = resolveModule('unimport', { url: pathToFileURL(nuxt) });
  } catch (error) {
    return { kind: 'failed', cause: isNotFound(error) ? 'unimport was not found' : causeOf(error) };
  }
  try {
    const loaded = (await import(pathToFileURL(path).href)) as Partial<UnimportScan>;
    if (typeof loaded.normalizeScanDirs !== 'function') {
      return { kind: 'failed', cause: `${path} has no normalizeScanDirs` };
    }
    return { kind: 'ok', unimport: loaded as UnimportScan };
  } catch (error) {
    return { kind: 'failed', cause: causeOf(error) };
  }
}

function rawDir(dir: ScanDir): string {
  return typeof dir === 'string' ? dir : dir.glob;
}

/** The dir as an absolute path: a relative one is read from the cwd that the scan uses. */
function dirOf(dir: ScanDir, options: ScanOptions | undefined): string {
  const raw = rawDir(dir);
  return raw.startsWith('!') ? raw : resolve(options?.cwd ?? process.cwd(), raw);
}

/**
 * The dirs of one scan, each with the globs that unimport makes for it. A glob that starts with
 * `!` leaves files out of the whole scan, so every dir keeps them.
 */
async function recordScan(scan: ImportScan, unimport: UnimportScan): Promise<RegistryImportDir[]> {
  const leftOut = unimport
    .normalizeScanDirs(scan.dirs, scan.options)
    .map(entry => entry.glob)
    .filter(glob => glob.startsWith('!'));
  const jobs = scan.dirs
    .filter(dir => !rawDir(dir).startsWith('!'))
    .map(async dir => {
      const globs = [
        ...unimport.normalizeScanDirs([dir], scan.options).map(entry => entry.glob),
        ...leftOut,
      ];
      return { dir: dirOf(dir, scan.options), globs, files: await globImportFiles(globs) };
    });
  const recorded = await Promise.all(jobs);
  return recorded;
}

/** The auto-import dirs of the app and of Nitro, with the files that their scans match. */
export async function collectImportDirs(
  scans: ImportScan[],
  unimport: UnimportScan,
): Promise<RegistryImportDir[]> {
  const perScan = await Promise.all(
    scans.map(async scan => {
      const dirs = await recordScan(scan, unimport);
      return dirs;
    }),
  );
  const recorded = perScan.flat();
  // `shared/utils` is in the scan of the app and in the scan of Nitro.
  const unique = new Map(recorded.map(entry => [JSON.stringify([entry.dir, entry.globs]), entry]));
  return [...unique.values()].toSorted((a, b) => compareStrings(a.dir, b.dir));
}

/** Keeps what the hooks of Nuxt and Nitro give, and records it when the registry is written. */
export class ImportDirRecorder {
  /** The list that Nuxt gives to `imports:dirs`. Modules change it, so it is read at the end. */
  public appDirs: string[] = [];
  private warned = false;

  /** The dirs, or `null` when they cannot be read: the check is then off, and the CLI says so. */
  public async record(rootDir: string, nitro: Nitro | null): Promise<RegistryImportDir[] | null> {
    const loaded = await loadUnimport(rootDir);
    if (loaded.kind === 'failed') {
      this.warn(loaded.cause);
      return null;
    }
    const scans: ImportScan[] = [{ dirs: this.appDirs }];
    const imports = nitro?.options.imports;
    if (imports !== undefined && imports !== false) {
      scans.push({ dirs: imports.dirs ?? [], options: imports.dirsScanOptions });
    }
    try {
      const dirs = await collectImportDirs(scans, loaded.unimport);
      return dirs;
    } catch (error) {
      this.warn(causeOf(error));
      return null;
    }
  }

  private warn(cause: string): void {
    if (!this.warned) {
      this.warned = true;
      useLogger('nuxt-layerscope').warn(unimportWarning(cause));
    }
  }
}
