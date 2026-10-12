import type { Layer } from '#src/types.ts';

/** A layer installed as a package: its root is under `node_modules`. */
export function isPackageLayer(layer: Layer): boolean {
  return layer.root.includes('/node_modules/');
}
