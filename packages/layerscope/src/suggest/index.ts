import type { Edge, Finding, Layer, LayerscopeConfig, Suggestion } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';

import type { Context } from './context.ts';
import { createContext, isLocal, pairKey, reaches } from './context.ts';
import { moveSuggestion, pickTarget } from './move.ts';

function leaveSuggestion(from: string, to: string): Suggestion {
  return {
    action: 'leave',
    message: `leave it: allowing "${from}" to use "${to}" would create a cycle, and no layer every user may depend on can hold it`,
    impact: { fixes: 0 },
  };
}

function allowSuggestion(context: Context, from: string, to: string): Suggestion {
  const fixes = context.findingsFor.get(pairKey(from, to)) ?? 0;
  return {
    action: 'allow',
    message: `allow "${from}" to use "${to}" (adds 1 edge, clears ${plural(fixes, 'finding')})`,
    impact: { fixes, edges: 1 },
  };
}

function suggest(context: Context, finding: Finding): Suggestion {
  const from = finding.fromLayer;
  const to = finding.toLayer ?? '';
  const file = finding.target;
  const owner = context.layers.find(layer => layer.name === to);
  const uses = file === null ? [] : (context.usesOf.get(file) ?? []);
  const cycle = reaches(context, to, from);
  const sharedByMany =
    new Set(uses.map(edge => edge.fromLayer).filter(name => name !== to)).size >= 2;

  if (
    file !== null &&
    owner !== undefined &&
    isLocal(owner, context.rootDir) &&
    (sharedByMany || cycle)
  ) {
    const target = pickTarget(context, file, owner, uses);
    if (target !== undefined) {
      return moveSuggestion(context, file, owner, target, uses);
    }
  }
  return cycle ? leaveSuggestion(from, to) : allowSuggestion(context, from, to);
}

export function addSuggestions(
  findings: Finding[],
  edges: Edge[],
  layers: Layer[],
  config: LayerscopeConfig,
  rootDir: string,
): Finding[] {
  const context = createContext(findings, edges, layers, config, rootDir);
  // A suggestion reads only the layer pair and the target file, so findings that share them
  // get the same one. Each finding gets its own copy, so no two findings share an object.
  const memo = new Map<string, Suggestion>();
  const suggestionFor = (finding: Finding): Suggestion => {
    const key = JSON.stringify([finding.fromLayer, finding.toLayer, finding.target]);
    const known = memo.get(key) ?? suggest(context, finding);
    memo.set(key, known);
    return { ...known, impact: { ...known.impact } };
  };
  return findings.map(finding =>
    finding.rule === 'layer-boundary'
      ? { ...finding, suggestion: suggestionFor(finding) }
      : finding,
  );
}
