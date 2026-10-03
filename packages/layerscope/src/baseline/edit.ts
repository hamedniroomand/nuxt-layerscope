import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import type { Finding } from '#src/types.ts';

import type { Baseline } from './index.ts';
import {
  BASELINE_VERSION,
  compareEntries,
  createBaseline,
  keyOf,
  readBaseline,
  toKeyed,
  writeBaseline,
} from './index.ts';

/** What one edit did: the file's text before it, for undo, and the baseline after it. */
export interface BaselineEdit {
  /** `null` when the file did not exist. */
  before: string | null;
  after: Baseline;
}

function textOf(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * Adds the findings with `keys` to the baseline. Each entry counts every finding with its key,
 * so accepting one row never leaves its siblings behind; the result is what
 * `check --update-baseline` writes for those findings.
 *
 * @param all Every current finding before the baseline applies, suppressed ones included.
 */
export function ignoreFindings(
  file: string,
  keys: string[],
  all: Finding[],
  rootDir: string,
): BaselineEdit {
  const before = textOf(file);
  const wanted = new Set(keys);
  const added = createBaseline(
    all.filter(finding => wanted.has(keyOf(toKeyed(finding, rootDir)))),
    rootDir,
  ).entries;
  const entries = new Map((readBaseline(file)?.entries ?? []).map(entry => [keyOf(entry), entry]));
  for (const entry of added) {
    entries.set(keyOf(entry), entry);
  }
  const after: Baseline = {
    version: BASELINE_VERSION,
    entries: [...entries.values()].toSorted(compareEntries),
  };
  writeBaseline(file, after);
  return { before, after };
}

/** Drops the entries with `keys`; their findings come back. */
export function removeEntries(file: string, keys: string[]): BaselineEdit {
  const before = textOf(file);
  const dropped = new Set(keys);
  const after: Baseline = {
    version: BASELINE_VERSION,
    entries: (readBaseline(file)?.entries ?? []).filter(entry => !dropped.has(keyOf(entry))),
  };
  writeBaseline(file, after);
  return { before, after };
}

/** Puts back the text an edit replaced, or removes the file when there was none. */
export function restoreBaseline(file: string, before: string | null): void {
  if (before === null) {
    rmSync(file, { force: true });
  } else {
    writeFileSync(file, before);
  }
}
