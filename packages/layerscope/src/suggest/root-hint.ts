import { mentionsLayer } from '#src/config/allow.ts';
import { describePreset, resolvePreset } from '#src/config/presets.ts';
import type {
  AnalyzeResult,
  Finding,
  Layer,
  LayerscopeConfig,
  PresetName,
  Suggestion,
} from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';

import type { Context } from './context.ts';

/**
 * True when `root` is a target that `from` does not name in `allow`, whole or scoped. A scoped
 * `root` entry already shows that the user knows `root` is a layer, so it gets no hint.
 */
export function needsRootHint(config: LayerscopeConfig, from: string, to: string): boolean {
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
export function rootAllowText(from: string, fixes: number): string {
  return `"root" is a layer too. To let "${from}" use the project's own app/ and shared/ code, add 'root' to its allow list (adds 1 edge, clears ${plural(fixes, 'finding')})`;
}

/** The hint for a layer whose `allow` the preset gave: `root` goes into the preset base. */
export function rootPresetText(
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
export function rootIsBase(context: Context): boolean {
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
export function rootBaseSuggestion(finding: Finding): Suggestion {
  return {
    action: 'leave',
    message: `move "${finding.symbol}" to root, or remove this use: root is the base layer and may not use other layers`,
    impact: { fixes: 0 },
  };
}

/**
 * A finding that the root note covers: a boundary finding that targets `root`, with an `allow`
 * suggestion, from a layer that does not list `root`. A cycle gets `leave`, so it is not covered.
 */
function hasRootHint(finding: Finding, config: LayerscopeConfig): boolean {
  return (
    finding.rule === 'layer-boundary' &&
    finding.toLayer === 'root' &&
    finding.suggestion?.action === 'allow' &&
    needsRootHint(config, finding.fromLayer, 'root')
  );
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
    if (hasRootHint(finding, config)) {
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

/**
 * The result with the root notes added, and a short message on the findings that a note covers.
 * Only the commands and tools that report findings call it, so a command that shows no findings
 * shows no root note, and DevTools keeps the full message.
 */
export function withRootNotes(result: AnalyzeResult): AnalyzeResult {
  const notes = rootAllowNotes(
    result.findings,
    result.config,
    result.layers,
    result.presetLayers ?? [],
  );
  if (notes.length === 0) {
    return result;
  }
  // The note gives the full fix once, so each finding it covers gets one short text.
  const findings = result.findings.map(finding =>
    hasRootHint(finding, result.config) && finding.suggestion !== undefined
      ? {
          ...finding,
          suggestion: {
            ...finding.suggestion,
            message: `"${finding.fromLayer}" may not use "root": root is a layer, see the note`,
          },
        }
      : finding,
  );
  return { ...result, findings, notes: [...result.notes, ...notes] };
}
