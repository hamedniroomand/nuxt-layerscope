import { join, relative } from 'pathe';

import type { Edge, Layer, Suggestion, SuggestionImpact } from '#src/types.ts';
import { compareStrings, plural } from '#src/utils/strings.ts';

import type { Context } from './context.ts';
import { isLocal, mayUse } from './context.ts';

function moveTargets(context: Context, file: string, owner: Layer, uses: Edge[]): Layer[] {
  const users = new Set(uses.map(edge => edge.fromLayer));
  const dependencies = context.edgesFrom.get(file) ?? [];
  return context.layers.filter(
    layer =>
      layer.name !== owner.name &&
      isLocal(layer, context.rootDir) &&
      [...users].every(user => mayUse(context, user, layer.name)) &&
      dependencies.every(
        edge => edge.toLayer === null || mayUse(context, layer.name, edge.toLayer),
      ),
  );
}

// ponytail: the layer with the shortest `allow` list wins; weigh by import distance if it misleads.
export function pickTarget(
  context: Context,
  file: string,
  owner: Layer,
  uses: Edge[],
): Layer | undefined {
  const size = (layer: Layer): number =>
    context.config.layers?.[layer.name]?.allow?.length ?? Number.POSITIVE_INFINITY;
  return moveTargets(context, file, owner, uses).toSorted(
    (a, b) => size(a) - size(b) || compareStrings(a.name, b.name),
  )[0];
}

export function moveSuggestion(
  context: Context,
  file: string,
  owner: Layer,
  target: Layer,
  uses: Edge[],
): Suggestion {
  const impact: SuggestionImpact = {
    fixes: context.findingsAt.get(file) ?? 0,
    files: new Set(uses.map(edge => edge.file)).size,
    imports: uses.filter(edge => edge.kind === 'import').length,
  };
  const users = new Set(uses.map(edge => edge.fromLayer)).size;
  const who = users === 1 ? 'its user' : `all ${users} layers using it`;
  const effect = [
    `${plural(impact.files ?? 0, 'file')} use it`,
    `${plural(impact.imports ?? 0, 'import')} to update`,
    `clears ${plural(impact.fixes, 'finding')}`,
  ].join(', ');
  return {
    action: 'move',
    message: `move it to layer "${target.name}", which ${who} may depend on (${effect})`,
    layer: target.name,
    file: join(target.root, relative(owner.root, file)),
    impact,
  };
}
