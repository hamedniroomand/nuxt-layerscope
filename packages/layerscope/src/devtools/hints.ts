import type { AnalyzeResult, Finding } from '#src/types.ts';

import type { AllowHint } from './protocol.ts';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

function quote(name: string): string {
  return `'${name.replaceAll("'", String.raw`\'`)}'`;
}

/** The `layers.<layer>` config entry with `add` appended to its `allow` list. */
function snippet(layer: string, allow: string[]): string {
  const key = IDENTIFIER.test(layer) ? layer : quote(layer);
  return `layers: {\n  ${key}: { allow: [${allow.map(name => quote(name)).join(', ')}] },\n}`;
}

/**
 * The copy-only allow fix for a boundary finding whose suggestion is to allow the target layer.
 * The count comes from the analyzer's suggestion; the tab never writes config.
 */
export function allowHint(finding: Finding, result: AnalyzeResult): AllowHint | undefined {
  const { suggestion, toLayer, fromLayer } = finding;
  if (suggestion?.action !== 'allow' || toLayer === null) {
    return undefined;
  }
  // The suggestion counts findings before the baseline applies, so the files do too.
  const inPair = (other: Finding): boolean =>
    other.fromLayer === fromLayer && other.toLayer === toLayer;
  const suppressed = (result.baseline?.suppressed ?? []).filter(other => inPair(other));
  const files = new Set(
    [...result.findings.filter(other => inPair(other)), ...suppressed].map(other => other.file),
  );
  const allow = result.config.layers?.[fromLayer]?.allow ?? [];
  return {
    kind: 'allow',
    layer: fromLayer,
    add: toLayer,
    resolves: suggestion.impact.fixes,
    files: files.size,
    baselined: suppressed.length,
    snippet: snippet(fromLayer, [...allow, toLayer]),
  };
}
