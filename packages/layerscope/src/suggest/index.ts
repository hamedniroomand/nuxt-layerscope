import { relative } from 'pathe';

import { isScoped, mentionsLayer } from '#src/config/allow.ts';
import { describePreset, resolvePreset } from '#src/config/presets.ts';
import type {
  AnalyzeResult,
  Edge,
  Finding,
  Layer,
  LayerscopeConfig,
  PresetName,
  Suggestion,
} from '#src/types.ts';
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

/**
 * True when `root` is a target that `from` does not name in `allow`, whole or scoped. A scoped
 * `root` entry already shows that the user knows `root` is a layer, so it gets no hint.
 */
function needsRootHint(config: LayerscopeConfig, from: string, to: string): boolean {
  return to === 'root' && !mentionsLayer(config.layers?.[from]?.allow ?? [], 'root');
}

interface PresetBase {
  name: PresetName;
  base: string[];
}

/**
 * The fix for a layer whose `allow` the preset gave. `root` goes into the base, which needs a
 * `features` shape when `layered` already has its one base layer. `stacked` takes no base, so
 * its layer gets an `allow` list instead, with the list the preset gave and `root` added.
 */
function presetFixText(
  from: string,
  preset: PresetBase,
  config: LayerscopeConfig,
  layers: Layer[],
): string {
  if (preset.name === 'stacked') {
    const names = layers.map(layer => layer.name).filter(name => name !== 'root');
    const given = resolvePreset('stacked', names).allow[names.indexOf(from)] ?? [];
    const list = [...given, 'root'].map(layer => `'${layer}'`).join(', ');
    return `set allow for "${from}" to [${list}], which replaces its preset list`;
  }
  // `layered` holds exactly one base layer, so a second one needs `features`.
  const shape = preset.name === 'layered' && preset.base.length > 0 ? 'features' : preset.name;
  const base = ['root', ...preset.base].map(layer => `'${layer}'`).join(', ');
  return `add 'root' to the preset base: preset: { name: '${shape}', base: [${base}] }`;
}

/** The allow hint for a layer whose `allow` the user wrote. `root` goes into that list. */
function rootAllowText(from: string, fixes: number): string {
  return `"root" is a layer too. To let "${from}" use the project's own app/ and shared/ code, add 'root' to its allow list (adds 1 edge, clears ${plural(fixes, 'finding')})`;
}

/** The hint for a layer whose `allow` the preset gave: `root` goes into the preset base. */
function rootPresetText(
  from: string,
  fixes: number,
  preset: PresetBase,
  config: LayerscopeConfig,
  layers: Layer[],
): string {
  return `"root" is a layer too. To let "${from}" use the project's own app/ and shared/ code, ${presetFixText(from, preset, config, layers)} (clears ${plural(fixes, 'finding')})`;
}

/**
 * True when `root` is in the base of the preset and its `allow` is the empty list that the preset
 * gives. Then `root` is the lowest base layer, and it may not use any feature layer.
 */
function rootIsBase(context: Context): boolean {
  const preset = describePreset(context.config, context.layers);
  const layers = context.config.layers ?? {};
  const allow = Object.hasOwn(layers, 'root') ? layers.root.allow : undefined;
  return preset?.base.includes('root') === true && allow?.length === 0;
}

/**
 * What to do with a use of a feature layer by `root`, under a preset with `root` as its base. The
 * action is `leave`: the fix is a change of the code, which layerscope does not move by itself.
 * The text names the symbol, and the memo of `addSuggestions` already has the symbol in its key.
 */
function rootBaseSuggestion(finding: Finding): Suggestion {
  return {
    action: 'leave',
    message: `move "${finding.symbol}" to root, or remove this use: root is the base layer and may not use feature layers`,
    impact: { fixes: 0 },
  };
}

function allowSuggestion(context: Context, from: string, to: string): Suggestion {
  const pair = context.boundaryBy.get(pairKey(from, to)) ?? [];
  const fixes = pair.length;
  const edges = pair.map(finding => edgeOfFinding(context, finding));
  const names = edges.every(edge => edge !== undefined) ? onlyNames(edges) : null;
  const hint = needsRootHint(context.config, from, to);
  // A preset base has no scoped entry, so the preset hint names the whole base, never `only`.
  if (hint && context.presetLayers.has(from)) {
    const preset = describePreset(context.config, context.layers);
    if (preset !== null) {
      return {
        action: 'allow',
        message: rootPresetText(from, fixes, preset, context.config, context.layers),
        // A stacked layer gets one list, which is one edge. A base change adds root to every layer
        // that the preset filled; the layers that keep their own `allow` do not change.
        impact: { fixes, edges: preset.name === 'stacked' ? 1 : context.presetLayers.size },
      };
    }
  }
  if (names !== null) {
    const known = (context.config.layers?.[from]?.allow ?? []).find(
      entry => isScoped(entry) && entry.layer === to,
    );
    const only = [
      ...new Set([...(known !== undefined && isScoped(known) ? known.only : []), ...names]),
    ];
    const allow = `allow "${from}" to use ${only.map(name => `"${name}"`).join(', ')} from "${to}" (adds ${known === undefined ? '1 edge' : 'no edge'}, clears ${plural(fixes, 'finding')})`;
    return {
      action: 'allow',
      message: hint ? `"root" is a layer too. ${allow}` : allow,
      only,
      impact: { fixes, edges: known === undefined ? 1 : 0 },
    };
  }
  return {
    action: 'allow',
    message: hint
      ? rootAllowText(from, fixes)
      : `allow "${from}" to use "${to}" (adds 1 edge, clears ${plural(fixes, 'finding')})`,
    impact: { fixes, edges: 1 },
  };
}

/**
 * One note per layer whose `allow` suggestions name `root` and that does not list `root`. The
 * note gives the hint once, where the per-finding suggestion repeats it. A cycle gets `leave`,
 * so its findings add no count. A preset layer gets the preset wording. The counts are the
 * findings given.
 */
export function rootAllowNotes(
  findings: Finding[],
  config: LayerscopeConfig,
  layers: Layer[] = [],
  presetLayers: string[] = [],
): string[] {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    if (
      finding.rule === 'layer-boundary' &&
      finding.toLayer === 'root' &&
      finding.suggestion?.action === 'allow' &&
      needsRootHint(config, finding.fromLayer, 'root')
    ) {
      counts.set(finding.fromLayer, (counts.get(finding.fromLayer) ?? 0) + 1);
    }
  }
  const preset = describePreset(config, layers);
  return [...counts].map(([from, fixes]) => {
    const lead = `"root" is a layer too, and it is not in the allow list of "${from}".`;
    const fix = `To let "${from}" use the project's own app/ and shared/ code,`;
    const count = `(clears ${plural(fixes, 'finding')}).`;
    return presetLayers.includes(from) && preset !== null
      ? `${lead} ${fix} ${presetFixText(from, preset, config, layers)} ${count}`
      : `${lead} ${fix} add 'root' to its allow list ${count}`;
  });
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
  if (finding.fromLayer === 'root' && rootIsBase(context)) {
    return rootBaseSuggestion(finding);
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
  presetLayers: string[] = [],
): Promise<Finding[]> {
  const context = createContext(findings, edges, layers, config, rootDir, presetLayers);
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

/**
 * The result with the root notes added. Only the commands and tools that report findings call
 * it, so a command that shows no findings does not show a root note.
 */
export function withRootNotes(result: AnalyzeResult): AnalyzeResult {
  const notes = rootAllowNotes(
    result.findings,
    result.config,
    result.layers,
    result.presetLayers ?? [],
  );
  return notes.length === 0 ? result : { ...result, notes: [...result.notes, ...notes] };
}
