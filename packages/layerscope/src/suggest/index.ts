import { relative } from 'pathe';

import { isScoped } from '#src/config/allow.ts';
import type { Edge, Finding, Layer, LayerscopeConfig, Suggestion } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';
import { createYielder } from '#src/utils/yield.ts';

import type { Context } from './context.ts';
import { createContext, edgeOfFinding, isLocal, pairKey, reaches } from './context.ts';
import { moveSuggestion, pickTarget } from './move.ts';
import { isExplicitImport, namesOfEdge, onlyNames } from './scoped.ts';

function leaveSuggestion(from: string, to: string): Suggestion {
  return {
    action: 'leave',
    message: `leave it: allowing "${from}" to use "${to}" would create a cycle, and no layer every user may depend on can hold it`,
    impact: { fixes: 0 },
  };
}

function allowSuggestion(context: Context, from: string, to: string): Suggestion {
  const pair = context.boundaryBy.get(pairKey(from, to)) ?? [];
  const fixes = pair.length;
  const edges = pair.map(finding => edgeOfFinding(context, finding));
  const names = edges.every(edge => edge !== undefined) ? onlyNames(edges) : null;
  if (names !== null) {
    const known = (context.config.layers?.[from]?.allow ?? []).find(
      entry => isScoped(entry) && entry.layer === to,
    );
    const only = [
      ...new Set([...(known !== undefined && isScoped(known) ? known.only : []), ...names]),
    ];
    return {
      action: 'allow',
      message: `allow "${from}" to use ${only.map(name => `"${name}"`).join(', ')} from "${to}" (adds ${known === undefined ? '1 edge' : 'no edge'}, clears ${plural(fixes, 'finding')})`,
      only,
      impact: { fixes, edges: known === undefined ? 1 : 0 },
    };
  }
  return {
    action: 'allow',
    message: `allow "${from}" to use "${to}" (adds 1 edge, clears ${plural(fixes, 'finding')})`,
    impact: { fixes, edges: 1 },
  };
}

function exposeSuggestion(context: Context, finding: Finding): Suggestion {
  const to = finding.toLayer ?? '';
  const layer = context.layers.find(candidate => candidate.name === to);
  const edge = edgeOfFinding(context, finding);
  const names = edge === undefined || isExplicitImport(edge) ? null : namesOfEdge(edge);
  // An explicit import is listed by the path of its file, which covers every name in it.
  const entry =
    names?.[0] ??
    (layer === undefined || finding.target === null
      ? finding.symbol
      : relative(layer.root, finding.target));
  const fixes = context.internalBy.get(pairKey(to, finding.symbol))?.length ?? 1;
  return {
    action: 'expose',
    message: `add "${entry}" to expose of "${to}" (clears ${plural(fixes, 'finding')})`,
    expose: entry,
    impact: { fixes },
  };
}

function suggest(context: Context, finding: Finding): Suggestion {
  if (finding.rule === 'layer-internal') {
    return exposeSuggestion(context, finding);
  }
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

const BATCH_FINDINGS = 200;

/** Adds a suggestion to each boundary finding; yields to the event loop between batches. */
export async function addSuggestions(
  findings: Finding[],
  edges: Edge[],
  layers: Layer[],
  config: LayerscopeConfig,
  rootDir: string,
): Promise<Finding[]> {
  const context = createContext(findings, edges, layers, config, rootDir);
  // A suggestion reads only the layer pair and the target file, so findings that share them
  // get the same one. Each finding gets its own copy, so no two findings share an object.
  const memo = new Map<string, Suggestion>();
  const suggestionFor = (finding: Finding): Suggestion => {
    const key = JSON.stringify([
      finding.rule,
      finding.fromLayer,
      finding.toLayer,
      finding.target,
      finding.symbol,
    ]);
    const known = memo.get(key) ?? suggest(context, finding);
    memo.set(key, known);
    return { ...known, impact: { ...known.impact } };
  };
  const pause = createYielder({ files: BATCH_FINDINGS });
  const result: Finding[] = [];
  for (const finding of findings) {
    result.push(
      finding.rule === 'layer-boundary' || finding.rule === 'layer-internal'
        ? { ...finding, suggestion: suggestionFor(finding) }
        : finding,
    );
    // eslint-disable-next-line no-await-in-loop -- yields between batches of findings
    await pause();
  }
  return result;
}
