import type { Layer } from '#src/types.ts';

export type OwnerLookup = (file: string) => Layer | null;

/** The layer whose root is the longest prefix of the file; files in node_modules have none. */
export function createOwnerLookup(layers: Layer[]): OwnerLookup {
  const deepestFirst = layers.toSorted((a, b) => b.root.length - a.root.length);
  return file => {
    const layer = deepestFirst.find(candidate => file.startsWith(`${candidate.root}/`));
    if (layer === undefined) {
      return null;
    }
    return file.slice(layer.root.length).includes('/node_modules/') ? null : layer;
  };
}
