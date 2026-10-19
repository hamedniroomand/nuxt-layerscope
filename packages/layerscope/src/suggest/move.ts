import { existsSync } from 'node:fs';

import { join, relative } from 'pathe';

import { isExposed } from '#src/rules/layer-internal.ts';
import type { Edge, Layer, Suggestion, SuggestionImpact } from '#src/types.ts';
import { compareStrings, plural } from '#src/utils/strings.ts';

import type { Context } from './context.ts';
import { isMoveTarget, permits } from './context.ts';
import type { DirKind, LayerNames } from './names.ts';
import { componentName, exportedNames, isAutoImported, namesOfLayer, SCANNED } from './names.ts';

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
 * default dirs: an auto-import dir (the script files at its top level), or a `components/` dir
 * for a file that is used as a component. A target that sets `imports.dirs` or turns
 * `imports.scan` off is not used for a file that is used as an auto-import, and a target that sets
 * `components` is not used for a file that is used as a component. layerscope does not know the
 * dirs of these layers. `moveTargets` also skips a script file for such an `imports` target.
 */
export function destinationOf(
  file: string,
  owner: Layer,
  target: Layer,
  uses: Edge[],
  srcTypes: boolean,
): string | null {
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
    (target.defaultImports === false || !isAutoImported(found.kind, inside, srcTypes))
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

function namesOf(context: Context, layer: Layer): LayerNames {
  let names = context.names.get(layer.name);
  if (names === undefined) {
    names = namesOfLayer(layer, context.srcTypes);
    context.names.set(layer.name, names);
  }
  return names;
}

/**
 * Whether a name of the moved file is already in a layer other than the owner, in another file.
 * Then the file would be a second one with that name, and Nuxt would use one of them. In the target
 * the two files conflict. In a third layer, Nuxt then uses only one of the files, for most dirs the
 * one of the layer that comes first, so after the move the file of the third layer could take the
 * name. layerscope does not compare the layer order. The names are the ones in the dirs that Nuxt
 * scans by default. A file with an `export * from` a package, an alias, or a path whose file
 * unimport does not find can export any name, so it conflicts with any name in the other layers.
 */
function hasNameConflict(
  context: Context,
  file: string,
  owner: Layer,
  target: Layer,
  dest: string,
): boolean {
  const others = context.layers.filter(layer => layer.name !== owner.name);
  const components = join(target.srcDir, 'components');
  const name =
    dest.startsWith(`${components}/`) && /\.(?:vue|jsx|tsx)$/u.test(dest)
      ? componentName(relative(components, dest))
      : null;
  const clash = name !== null && others.some(layer => namesOf(context, layer).components.has(name));
  const sources = DIR_KINDS.some(kind =>
    (['composables', 'utils', 'types'] as const).some(dir =>
      dest.startsWith(`${join(target[kind], dir)}/`),
    ),
  );
  // Outside the auto-import dirs the names do not matter, so the file is not read.
  if (!sources) {
    return clash;
  }
  const moved = exportedNames(file);
  return (
    clash ||
    others.some(layer => {
      const names = namesOf(context, layer);
      return (
        moved.names.some(exported => names.imports.has(exported)) ||
        (moved.unknown && (names.imports.size > 0 || names.unknownImports)) ||
        (names.unknownImports && moved.names.length > 0)
      );
    })
  );
}

function moveTargets(context: Context, file: string, owner: Layer, uses: Edge[]): MoveTarget[] {
  const dependencies = context.edgesFrom.get(file) ?? [];
  const targets: MoveTarget[] = [];
  for (const layer of context.layers) {
    const moved = destinationOf(file, owner, layer, uses, context.srcTypes);
    if (layer.name === owner.name || !isMoveTarget(layer, context.rootDir) || moved === null) {
      continue;
    }
    // A layer that sets `imports.dirs` or turns `imports.scan` off can scan any dir, so it gets no
    // script file.
    if (layer.defaultImports === false && SCANNED.test(moved)) {
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
    if (usersFit && dependenciesFit && !hasNameConflict(context, file, owner, layer, moved)) {
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
