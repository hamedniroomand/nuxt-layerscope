import { join, relative } from 'pathe';

import { keyOf, toKeyed } from '#src/baseline/index.ts';
import { newSpecifier } from '#src/fix/specifier.ts';
import type { BaselineEntry, Edge, Finding } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

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
 * dependency still counts as new.
 */
function findingAtBase(finding: Finding, renames: Map<string, string>, rootDir: string): Finding {
  const file = pathAtBase(finding.file, renames, rootDir);
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
  renames: Map<string, string>,
  rootDir: string,
): MappedFindings {
  const now = new Map<string, Pick<BaselineEntry, 'file' | 'symbol'>>();
  const mapped = findings.map(finding => {
    const atBase = findingAtBase(finding, renames, rootDir);
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
