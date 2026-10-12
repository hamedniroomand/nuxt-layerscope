import type { Layer } from '#src/types.ts';

export type OwnerLookup = (file: string) => Layer | null;

interface Prefix {
  layer: Layer;
  dir: string;
}

function isInside(dir: string, path: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

/**
 * The root of a layer, and its `srcDir`, `serverDir` and shared dir when one of them is outside
 * the root (for example `serverDir: '../api'`). A dir inside the root is already covered by it.
 * The dirs can come from a registry file: one that is missing or not a string is left out. A dir
 * with a `node_modules` segment is left out too: files there are packages, and the check for them
 * looks only below the matched dir, so it would not see that segment.
 */
export function sourceDirsOutsideRoot(layer: Layer): string[] {
  const outside = [layer.srcDir, layer.serverDir, layer.sharedDir].filter(
    (dir): dir is string =>
      typeof dir === 'string' &&
      dir !== '' &&
      !isInside(layer.root, dir) &&
      !dir.split(/[\\/]/u).includes('node_modules'),
  );
  return [...new Set(outside)];
}

/**
 * The layer that holds the file: the one with the longest matching prefix, from its root or from
 * a source dir outside its root. On an equal prefix, the layer whose root it is wins over a layer
 * that has it as a source dir. Otherwise the layer that comes first wins. Files in node_modules
 * below that prefix have none.
 */
export function createOwnerLookup(layers: Layer[]): OwnerLookup {
  // Roots come before source dirs, and the sort keeps the order of equal lengths.
  const prefixes: Prefix[] = [
    ...layers.map(layer => ({ layer, dir: layer.root })),
    ...layers.flatMap(layer => sourceDirsOutsideRoot(layer).map(dir => ({ layer, dir }))),
  ];
  const deepestFirst = prefixes.toSorted((a, b) => b.dir.length - a.dir.length);
  return file => {
    const match = deepestFirst.find(candidate => file.startsWith(`${candidate.dir}/`));
    if (match === undefined) {
      return null;
    }
    return file.slice(match.dir.length).includes('/node_modules/') ? null : match.layer;
  };
}
