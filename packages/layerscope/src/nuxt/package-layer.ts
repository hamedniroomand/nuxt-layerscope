import type { Layer } from '#src/types.ts';

/** A layer installed as a package: its root is under `node_modules`. */
export function isPackageLayer(layer: Layer): boolean {
  return layer.root.includes('/node_modules/');
}

/** The root with one trailing slash; the root `/` or `C:/` already has it. */
function rootPrefix(rootDir: string): string {
  return rootDir.endsWith('/') ? rootDir : `${rootDir}/`;
}

/** The layer root is a dir below the project root, not the project root itself. */
export function isBelowRoot(layer: Layer, rootDir: string): boolean {
  return layer.root !== rootDir && layer.root.startsWith(rootPrefix(rootDir));
}

/**
 * A layer whose root is not the project root and not inside it, for example a pnpm workspace
 * package. Another app can use its symbols. Both paths are real paths, so a link, the case of the
 * path and a trailing slash are already settled; the test has the slash, so `/p/app-ui` is outside
 * `/p/app`.
 */
export function isOutsideRoot(layer: Layer, rootDir: string): boolean {
  return layer.root !== rootDir && !isBelowRoot(layer, rootDir);
}
