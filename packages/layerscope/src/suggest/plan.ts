import { applyBaseline } from '#src/baseline/index.ts';
import { ruleSeverity } from '#src/config/rules.ts';
import { collectUpdates } from '#src/fix/updates.ts';
import { compareByPosition } from '#src/rules/compare.ts';
import { cycleFindings } from '#src/rules/layer-cycle.ts';
import { isExposed } from '#src/rules/layer-internal.ts';
import type { Edge, Finding } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { Context } from './context.ts';
import { permits } from './context.ts';
import { moveSuggestion } from './move.ts';

interface Moved {
  layer: string;
  file: string;
}

/** The moves in the suggestions, by the file that moves. */
function movesIn(findings: Finding[]): Map<string, Moved> {
  const moves = new Map<string, Moved>();
  for (const { target, suggestion } of findings) {
    if (target !== null && suggestion?.action === 'move' && suggestion.layer !== undefined) {
      moves.set(target, { layer: suggestion.layer, file: suggestion.file ?? target });
    }
  }
  return moves;
}

/** The edge with the layer and path that the moves give to both of its ends. */
function afterMoves(edge: Edge, moves: Map<string, Moved>): Edge {
  const importer = moves.get(edge.file);
  const imported = edge.to === null ? undefined : moves.get(edge.to);
  return {
    ...edge,
    file: importer?.file ?? edge.file,
    fromLayer: importer?.layer ?? edge.fromLayer,
    to: imported?.file ?? edge.to,
    toLayer: imported?.layer ?? edge.toLayer,
  };
}

/**
 * The chains of the cycles that `check` shows for the edges after the moves: the edges are in
 * the order that `analyze` gives them, then the real rule runs, then the baseline is applied.
 */
function liveCycles(context: Context, moves: Map<string, Moved>): Set<string> {
  const edges = context.edges
    .map(edge => afterMoves(edge, moves))
    .toSorted((a, b) => compareByPosition(a, b));
  const found = cycleFindings(edges, context.config);
  const live =
    context.baseline === null
      ? found
      : applyBaseline(found, context.baseline, '', context.rootDir).findings;
  return new Set(live.map(finding => finding.symbol));
}

/** The files whose edges would break `check` with these moves: the importer, or else the imported. */
function brokenEdges(context: Context, moves: Map<string, Moved>): Set<string> {
  const broken = new Set<string>();
  for (const file of moves.keys()) {
    const edges = [...(context.usesOf.get(file) ?? []), ...(context.edgesFrom.get(file) ?? [])];
    for (const edge of edges) {
      const after = afterMoves(edge, moves);
      if (!permits(context, after) || !isExposed(after, context.config, context.layers)) {
        broken.add(moves.has(edge.file) ? edge.file : (edge.to ?? file));
      }
    }
  }
  return broken;
}

/**
 * The moves to keep, when the moves together make `check` show a cycle that it does not show now
 * and the rule is on. A cycle is the same cycle when its chain is the same: it can change its
 * file. A cycle that the baseline accepts is not shown, so it is new when a move makes it show.
 * Nothing is dropped when the moves are fine together. Else the moves are added one after the
 * other, in order, and a move stays only when the moves kept so far and it show no new cycle.
 */
function withoutNewCycles(context: Context, moves: Map<string, Moved>): Map<string, Moved> {
  if (ruleSeverity(context.config, 'layer-cycle') === 'off') {
    return moves;
  }
  context.cycles ??= liveCycles(context, new Map());
  const known = context.cycles;
  const grows = (done: Map<string, Moved>): boolean =>
    [...liveCycles(context, done)].some(chain => !known.has(chain));
  if (!grows(moves)) {
    return moves;
  }
  const kept = new Map<string, Moved>();
  for (const file of [...moves.keys()].toSorted((a, b) => compareStrings(a, b))) {
    const moved = moves.get(file);
    if (moved !== undefined && !grows(new Map([...kept, [file, moved]]))) {
      kept.set(file, moved);
    }
  }
  return kept;
}

/**
 * The files whose moves are dropped, so that the moves that are left pass `check` together.
 * A move is checked with the files where they are now, so two moves can break each other, or
 * make a layer cycle together. The moves only get fewer, so the loop ends. The checks run
 * again until the set does not change. This is a guard: one pass is enough today.
 */
export function droppedMoves(context: Context, findings: Finding[]): Set<string> {
  let moves = movesIn(findings);
  const dropped = new Set<string>();
  for (;;) {
    const before = moves.size;
    const broken = brokenEdges(context, moves);
    moves = withoutNewCycles(context, new Map([...moves].filter(([file]) => !broken.has(file))));
    if (moves.size === before) {
      break;
    }
  }
  for (const file of movesIn(findings).keys()) {
    if (!moves.has(file)) {
      dropped.add(file);
    }
  }
  return dropped;
}

/** The moves with the count of imports of the plan, which needs every move to be known. */
export function withPlanCounts(context: Context, findings: Finding[]): Finding[] {
  const moves = new Map([...movesIn(findings)].map(([file, moved]) => [file, moved.file]));
  const updates = collectUpdates(context.edges, moves);
  return findings.map(finding => {
    const { target, suggestion } = finding;
    const layer = context.layers.find(({ name }) => name === suggestion?.layer);
    const owner = context.layers.find(({ name }) => name === finding.toLayer);
    if (
      target === null ||
      suggestion?.action !== 'move' ||
      suggestion.file === undefined ||
      layer === undefined ||
      owner === undefined
    ) {
      return finding;
    }
    const uses = context.usesOf.get(target) ?? [];
    const imports = updates.get(target)?.length ?? 0;
    return {
      ...finding,
      suggestion: moveSuggestion(
        context,
        target,
        owner,
        { layer, file: suggestion.file },
        uses,
        imports,
      ),
    };
  });
}
