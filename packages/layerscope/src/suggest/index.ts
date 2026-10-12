import type { Baseline } from '#src/baseline/index.ts';
import type {
  AnalyzeResult,
  Edge,
  Finding,
  Layer,
  LayerscopeConfig,
  Suggestion,
} from '#src/types.ts';
import { createYielder } from '#src/utils/yield.ts';

import { allowSuggestion, exposeSuggestion } from './allow.ts';
import { acceptedBy, bare } from './baseline.ts';
import type { Context } from './context.ts';
import { createContext, isLocal, reaches } from './context.ts';
import { moveSuggestion, pickTarget } from './move.ts';
import { droppedMoves, withPlanCounts } from './plan.ts';
import { rootBaseSuggestion, rootIsBase } from './root-hint.ts';

const BATCH_FINDINGS = 200;

function leaveSuggestion(from: string, to: string): Suggestion {
  return {
    action: 'leave',
    message: `leave it: allowing "${from}" to use "${to}" would create a cycle, and no layer every user may depend on can hold it`,
    impact: { fixes: 0 },
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
  // Root is the base layer: a file that it uses from a feature layer can move into root.
  const rootBase = from === 'root' && rootIsBase(context);

  if (
    file !== null &&
    owner !== undefined &&
    isLocal(owner, context.rootDir) &&
    !context.blocked.has(file) &&
    (sharedByMany || cycle || rootBase)
  ) {
    const target = pickTarget(context, file, owner, uses);
    if (target !== undefined) {
      return moveSuggestion(context, file, owner, target, uses);
    }
  }
  if (rootBase) {
    return rootBaseSuggestion(finding);
  }
  return cycle ? leaveSuggestion(from, to) : allowSuggestion(context, from, to);
}

/**
 * A suggestion reads only the layer pair and the target file, so findings that share them get the
 * same one. Each finding gets its own copy, so no two findings share an object.
 */
function suggester(context: Context): (finding: Finding) => Suggestion {
  const memo = new Map<string, Suggestion>();
  return finding => {
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
}

async function suggestAll(context: Context, findings: Finding[]): Promise<Finding[]> {
  const suggestionFor = suggester(context);
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

/**
 * Adds a suggestion to each boundary and internal finding; yields to the event loop between
 * batches. Give it the findings that `check` shows, so the counts agree with them. The moves are
 * checked together, and the ones that would break `check` are dropped. The findings of a dropped
 * move get the suggestion that is not a move, and the other suggestions stay as they are.
 * `baseline` is what the baseline accepts: a cycle that it accepts is not new.
 */
export async function addSuggestions(
  findings: Finding[],
  edges: Edge[],
  layers: Layer[],
  config: LayerscopeConfig,
  rootDir: string,
  presetLayers: string[] = [],
  baseline: Baseline | null = null,
): Promise<Finding[]> {
  const context = createContext(findings, edges, layers, config, rootDir, presetLayers);
  context.baseline = baseline;
  const result = await suggestAll(context, findings);
  const dropped = droppedMoves(context, result);
  if (dropped.size === 0) {
    return withPlanCounts(context, result);
  }
  for (const file of dropped) {
    context.blocked.add(file);
  }
  const suggestionFor = suggester(context);
  const final: Finding[] = [];
  for (const finding of result) {
    const again =
      finding.target !== null && dropped.has(finding.target) && finding.suggestion !== undefined;
    final.push(again ? { ...finding, suggestion: suggestionFor(finding) } : finding);
  }
  return withPlanCounts(context, final);
}

/** The result with a suggestion on each finding that it shows. The accepted ones get none. */
export async function withSuggestions(result: AnalyzeResult): Promise<AnalyzeResult> {
  const findings = await addSuggestions(
    result.findings,
    result.edges,
    result.layers,
    result.config,
    result.rootDir,
    result.presetLayers,
    result.baseline === undefined ? null : acceptedBy(result.baseline, result.rootDir),
  );
  return {
    ...result,
    findings,
    ...(result.baseline === undefined
      ? {}
      : { baseline: { ...result.baseline, suppressed: result.baseline.suppressed.map(bare) } }),
  };
}

export { rootAllowNotes, withRootNotes } from './root-hint.ts';
