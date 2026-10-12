import { relative } from 'pathe';

import { isScoped } from '#src/config/allow.ts';
import { describePreset } from '#src/config/presets.ts';
import type { Finding, Suggestion } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';

import type { Context } from './context.ts';
import { edgeOfFinding, pairKey } from './context.ts';
import { needsRootHint, rootAllowText, rootPresetText } from './root-hint.ts';
import { isExplicitImport, namesOfEdge, onlyNames } from './scoped.ts';

export function allowSuggestion(context: Context, from: string, to: string): Suggestion {
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

export function exposeSuggestion(context: Context, finding: Finding): Suggestion {
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
