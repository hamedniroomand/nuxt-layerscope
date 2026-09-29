import { compareStrings } from '#src/utils/strings.ts';

interface Positioned {
  file: string;
  line: number;
  column: number;
  symbol: string;
  rule?: string;
  kind?: string;
}

/** Total order on position, then rule or kind, then symbol, for deterministic reports. */
export function compareByPosition(a: Positioned, b: Positioned): number {
  return (
    compareStrings(a.file, b.file) ||
    a.line - b.line ||
    a.column - b.column ||
    compareStrings(a.rule ?? a.kind ?? '', b.rule ?? b.kind ?? '') ||
    compareStrings(a.symbol, b.symbol)
  );
}
