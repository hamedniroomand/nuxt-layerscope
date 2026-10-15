import { join, relative } from 'pathe';

import { keyOf, toKeyed } from '#src/baseline/index.ts';
import { newSpecifier } from '#src/fix/specifier.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import { destinationOf } from '#src/suggest/move.ts';
import type { BaselineEntry, Edge, Finding, Layer } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

import type { Rename } from './git.ts';

/** Git's default score for a rename. */
const SCORE = 50;

/**
 * The renames that `drift` follows, from the new path to the old path. A pair with a lower score
 * is followed only when it is a move of `fix`: the same place in another layer. Many files have
 * the same name (`index.vue`), so a low score with the same name is not enough.
 */
function followed(
  renames: Map<string, Rename>,
  rootDir: string,
  ownerOf: OwnerLookup,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [to, { from, score }] of renames) {
    const oldFile = join(rootDir, from);
    const newFile = join(rootDir, to);
    const oldOwner = ownerOf(oldFile);
    const newOwner = ownerOf(newFile);
    const fixMove =
      oldOwner !== null &&
      newOwner !== null &&
      oldOwner.name !== newOwner.name &&
      destinationOf(oldFile, oldOwner, newOwner, []) === newFile;
    if (score >= SCORE || fixMove) {
      result.set(to, from);
    }
  }
  return result;
}

/**
 * The path of `file` at the base: its old path when git renamed it, else the same path. `renames`
 * has paths relative to the real root; the analysis can give a path through a link.
 */
function pathAtBase(file: string, renames: Map<string, string>, rootDir: string): string {
  const old = renames.get(relative(realPath(rootDir), realPath(file)));
  return old === undefined ? file : join(rootDir, old);
}

/**
 * The finding as it was at the base. The file gets its old path. A relative import gets the
 * specifier that pointed from the old importer to the old target, made by the function that `fix`
 * uses to rewrite imports after a move. The rule and the target layer do not change, so a changed
 * dependency still counts as new. A finding with a target layer in a file that moved from another
 * layer keeps its path: the key has no source layer, so it is a new layer crossing.
 */
function findingAtBase(
  finding: Finding,
  renames: Map<string, string>,
  rootDir: string,
  ownerOf: OwnerLookup,
): Finding {
  const file = pathAtBase(finding.file, renames, rootDir);
  if (
    file !== finding.file &&
    finding.toLayer !== null &&
    ownerOf(file)?.name !== finding.fromLayer
  ) {
    return finding;
  }
  const { target } = finding;
  if (!finding.symbol.startsWith('.') || target === null) {
    return { ...finding, file };
  }
  const oldTarget = pathAtBase(target, renames, rootDir);
  if (file === finding.file && oldTarget === target) {
    return { ...finding, file };
  }
  const edge = { symbol: finding.symbol, file: finding.file, to: target } as Edge;
  return { ...finding, file, symbol: newSpecifier(edge, file, oldTarget) ?? finding.symbol };
}

export interface MappedFindings {
  /** The findings with the paths and specifiers that they had at the base. */
  findings: Finding[];
  /** An entry at the base, with the path and the symbol that it has today. */
  today: (entry: BaselineEntry) => BaselineEntry;
}

/** Maps the findings of the working tree back to the base, so a renamed file keeps its entries. */
export function mapToBase(
  findings: Finding[],
  renames: Map<string, Rename>,
  rootDir: string,
  layers: Layer[],
): MappedFindings {
  const ownerOf = createOwnerLookup(layers);
  const paths = followed(renames, rootDir, ownerOf);
  const now = new Map<string, Pick<BaselineEntry, 'file' | 'symbol'>>();
  const mapped = findings.map(finding => {
    const atBase = findingAtBase(finding, paths, rootDir, ownerOf);
    const key = keyOf(toKeyed(atBase, rootDir));
    if (!now.has(key)) {
      now.set(key, { file: relative(rootDir, finding.file), symbol: finding.symbol });
    }
    return atBase;
  });
  return {
    findings: mapped,
    today: entry => ({ ...entry, ...now.get(keyOf(entry)) }),
  };
}
