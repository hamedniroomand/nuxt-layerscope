import type { SymbolEntry } from '#src/devtools/protocol.ts';

const MAX_ROWS = 12;

function rank(name: string, query: string): number {
  const lower = name.toLowerCase();
  if (lower === query) {
    return 0;
  }
  if (lower.startsWith(query)) {
    return 1;
  }
  return lower.includes(query) ? 2 : -1;
}

/** Names that match `query`: exact first, then prefixes, then the rest; at most 12. */
export function suggestSymbols(symbols: SymbolEntry[], query: string): SymbolEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [];
  }
  return symbols
    .map(symbol => ({ symbol, rank: rank(symbol.name, needle) }))
    .filter(entry => entry.rank !== -1)
    .toSorted((a, b) => a.rank - b.rank || a.symbol.name.length - b.symbol.name.length)
    .slice(0, MAX_ROWS)
    .map(entry => entry.symbol);
}
