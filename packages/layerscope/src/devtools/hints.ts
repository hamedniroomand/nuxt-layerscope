import { isScoped } from '#src/config/allow.ts';
import type { AllowEntry, AnalyzeResult, Finding } from '#src/types.ts';

import type { AllowHint } from './protocol.ts';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

function quote(name: string): string {
  return `'${name.replaceAll("'", String.raw`\'`)}'`;
}

/** The `layers.<layer>` config entry with `add` appended to its `allow` list. */
function snippet(layer: string, allow: AllowEntry[]): string {
  const key = IDENTIFIER.test(layer) ? layer : quote(layer);
  const entries = allow.map(entry =>
    isScoped(entry)
      ? `{ layer: ${quote(entry.layer)}, only: [${entry.only.map(name => quote(name)).join(', ')}] }`
      : quote(entry),
  );
  return `layers: {\n  ${key}: { allow: [${entries.join(', ')}] },\n}`;
}

/** `allow` with the entry for `toLayer` added: whole, or scoped to `only` (joined with an old one). */
function withEntry(allow: AllowEntry[], toLayer: string, only?: string[]): AllowEntry[] {
  if (only === undefined) {
    return [...allow, toLayer];
  }
  const old = allow.find(entry => isScoped(entry) && entry.layer === toLayer);
  const merged = [...new Set([...(old !== undefined && isScoped(old) ? old.only : []), ...only])];
  return [...allow.filter(entry => entry !== old), { layer: toLayer, only: merged }];
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
    ...(suggestion.only === undefined ? {} : { only: suggestion.only }),
    snippet: snippet(fromLayer, withEntry(allow, toLayer, suggestion.only)),
  };
}
