export function exportCsv(rows: { id: number; total: number }[]): string {
  // On purpose: `analytics` is a global that a script tag adds at runtime, so layerscope cannot
  // resolve it. An unresolved-reference warning.
  analytics.track('export-csv');
  return rows.map(row => `${row.id},${formatPrice(row.total)}`).join('\n');
}
