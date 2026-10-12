import { existsSync } from 'node:fs';

import { join, relative } from 'pathe';

import { isExposed } from '#src/rules/layer-internal.ts';
import type { Edge, Layer, Suggestion, SuggestionImpact } from '#src/types.ts';
import { compareStrings, plural } from '#src/utils/strings.ts';

import type { Context } from './context.ts';
import { isMoveTarget, permits } from './context.ts';
import type { DirKind } from './names.ts';
import { componentName, exportedNames, isAutoImported, namesOfLayer } from './names.ts';

const DIR_KINDS: DirKind[] = ['srcDir', 'serverDir', 'sharedDir'];

export interface MoveTarget {
  layer: Layer;
  file: string;
}

/** A use through an auto-import, or through the `#imports` module, which is the same. */
function usesAutoImport(edge: Edge): boolean {
  return edge.kind === 'auto-import' || /^#imports(?::|$)/u.test(edge.symbol);
}

/** A use as a component, or through the `#components` module, which is the same. */
function usesComponent(edge: Edge): boolean {
  return edge.kind === 'component' || /^#components(?::|$)/u.test(edge.symbol);
}

/**
 * Where the file lands in `target`: the same path inside the same kind of source dir. `null`
 * when the file is in no source dir of its owner, or when Nuxt would not find it there under its
 * default dirs: an auto-import dir (the script files in it, and the `index` file of each sub dir),
 * or a `components/` dir for a file that is used as a component. A target that sets its own
 * `imports` dirs or component dirs is not used, as layerscope does not know them.
 */
function destinationOf(file: string, owner: Layer, target: Layer, uses: Edge[]): string | null {
  const found = DIR_KINDS.map(kind => ({ kind, dir: owner[kind] }))
    .filter(({ dir }) => file.startsWith(`${dir}/`))
    .toSorted((a, b) => b.dir.length - a.dir.length)
    .at(0);
  if (found === undefined) {
    return null;
  }
  const inside = relative(found.dir, file);
  if (
    uses.some(edge => usesAutoImport(edge)) &&
    (target.defaultImports === false || !isAutoImported(found.kind, inside))
  ) {
    return null;
  }
  if (
    uses.some(edge => usesComponent(edge)) &&
    (!owner.defaultComponents || !target.defaultComponents || !inside.startsWith('components/'))
  ) {
    return null;
  }
  return join(target[found.kind], inside);
}

/**
 * Whether a name of the moved file is already in the target, in another file. Then the file
 * would be a second one with that name, and Nuxt would use one of them. The names are the ones
 * in the dirs that Nuxt scans by default.
 */
function hasNameConflict(context: Context, file: string, target: Layer, dest: string): boolean {
  let names = context.names.get(target.name);
  if (names === undefined) {
    names = namesOfLayer(target);
    context.names.set(target.name, names);
  }
  const components = join(target.srcDir, 'components');
  const clash =
    dest.startsWith(`${components}/`) &&
    /\.(?:vue|jsx|tsx)$/u.test(dest) &&
    names.components.has(componentName(relative(components, dest)));
  const sources = DIR_KINDS.some(kind =>
    (['composables', 'utils', 'types'] as const).some(dir =>
      dest.startsWith(`${join(target[kind], dir)}/`),
    ),
  );
  return clash || (sources && exportedNames(file).some(name => names.imports.has(name)));
}

function moveTargets(context: Context, file: string, owner: Layer, uses: Edge[]): MoveTarget[] {
  const dependencies = context.edgesFrom.get(file) ?? [];
  const targets: MoveTarget[] = [];
  for (const layer of context.layers) {
    const moved = destinationOf(file, owner, layer, uses);
    if (layer.name === owner.name || !isMoveTarget(layer, context.rootDir) || moved === null) {
      continue;
    }
    // After the move every user, in the owner layer too, would point into the candidate layer.
    // Each of them must be allowed to use it, and the layer must expose what they use.
    const usersFit = uses.every(edge => {
      const after = { ...edge, to: moved, toLayer: layer.name };
      return permits(context, after) && isExposed(after, context.config, context.layers);
    });
    // The file would use from inside the candidate. What it uses in the owner layer is now
    // another layer, so the same two checks apply.
    const dependenciesFit = dependencies.every(edge => {
      const after = { ...edge, fromLayer: layer.name };
      return permits(context, after) && isExposed(after, context.config, context.layers);
    });
    if (usersFit && dependenciesFit && !hasNameConflict(context, file, layer, moved)) {
      targets.push({ layer, file: moved });
    }
  }
  return targets;
}

// ponytail: the layer with the shortest `allow` list wins; weigh by import distance if it misleads.
export function pickTarget(
  context: Context,
  file: string,
  owner: Layer,
  uses: Edge[],
): MoveTarget | undefined {
  const size = ({ layer }: MoveTarget): number =>
    context.config.layers?.[layer.name]?.allow?.length ?? Number.POSITIVE_INFINITY;
  // A destination is taken when a file is there, or when a move of another file claimed it. The
  // repeated findings of one file claim the same destination for it, which is no conflict.
  const taken = ({ file: destination }: MoveTarget): boolean =>
    existsSync(destination) || (context.claimed.get(destination) ?? file) !== file;
  const picked = moveTargets(context, file, owner, uses)
    .toSorted((a, b) => size(a) - size(b) || compareStrings(a.layer.name, b.layer.name))
    .find(candidate => !taken(candidate));
  if (picked !== undefined) {
    context.claimed.set(picked.file, file);
  }
  return picked;
}

/** The layers that use the file, the owner layer not counted. */
function userLayers(uses: Edge[], owner: string): number {
  return new Set(uses.map(edge => edge.fromLayer).filter(name => name !== owner)).size;
}

export function moveMessage(layer: string, impact: SuggestionImpact, users: number): string {
  const who = users === 1 ? 'its user' : `each of the ${users} layers that use it`;
  const effect = [
    `${plural(impact.files ?? 0, 'file')} ${impact.files === 1 ? 'uses' : 'use'} it`,
    `${plural(impact.imports ?? 0, 'import')} to update`,
    `clears ${plural(impact.fixes, 'finding')}`,
  ].join(', ');
  return `move it to layer "${layer}", which ${who} may depend on (${effect})`;
}

/**
 * The move of a file. The count of imports is the one of the plan, which `addSuggestions` sets
 * when all moves are known: the plan, not this move alone, tells which imports change.
 */
export function moveSuggestion(
  context: Context,
  file: string,
  owner: Layer,
  target: MoveTarget,
  uses: Edge[],
  imports = 0,
): Suggestion {
  const impact: SuggestionImpact = {
    fixes: context.findingsAt.get(file) ?? 0,
    files: new Set(uses.map(edge => edge.file)).size,
    imports,
  };
  return {
    action: 'move',
    message: moveMessage(target.layer.name, impact, userLayers(uses, owner.name)),
    layer: target.layer.name,
    file: target.file,
    impact,
  };
}
