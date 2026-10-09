import { edgeName } from '#src/rules/exposure.ts';
import type { Edge, Finding } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

/** More names than this are a sign that the whole layer is meant. */
export const MAX_ONLY = 3;

/** An explicit import has a specifier, not a name, so a scoped entry would need a glob. */
function isSpecifier(symbol: string): boolean {
  return !/^#(?:imports|components):/u.test(symbol) && /[./~@#]/u.test(symbol);
}

/** The name a finding is known by in an `only` or `expose` list, or `null` for a specifier. */
export function nameOfFinding(finding: Finding): string | null {
  if (isSpecifier(finding.symbol)) {
    return null;
  }
  return edgeName({ symbol: finding.symbol } as Edge);
}

/**
 * The names behind the findings of one layer pair, when there are few and every one is a name.
 * `null` means a scoped entry does not fit: use the whole layer.
 */
export function onlyNames(findings: Finding[]): string[] | null {
  const names = new Set<string>();
  for (const finding of findings) {
    const name = nameOfFinding(finding);
    if (name === null) {
      return null;
    }
    names.add(name);
  }
  return names.size > 0 && names.size <= MAX_ONLY ? [...names].toSorted(compareStrings) : null;
}
