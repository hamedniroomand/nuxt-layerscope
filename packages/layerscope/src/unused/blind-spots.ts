import { isOutsideRoot, isPackageLayer } from '#src/nuxt/package-layer.ts';
import type { AnalyzeResult, UnreadFile } from '#src/types.ts';

/** Something that `unused` does not see: a use that it does not count, or a layer it does not list. */
export type BlindSpot =
  | { kind: 'test-files' }
  | { kind: 'ignored' }
  | { kind: 'package-layers' }
  | { kind: 'outside-root'; layers: string[] }
  /** Nuxt Content can render any component by its name, so every component is marked. */
  | { kind: 'nuxt-content' }
  | { kind: 'unreadable'; files: UnreadFile[] };

/** The blind spots that apply to this run. Test files always apply: layerscope never scans them. */
export function findBlindSpots(result: AnalyzeResult): BlindSpot[] {
  const spots: BlindSpot[] = [{ kind: 'test-files' }];
  if ((result.config.ignore ?? []).length > 0) {
    spots.push({ kind: 'ignored' });
  }
  if (result.layers.some(isPackageLayer)) {
    spots.push({ kind: 'package-layers' });
  }
  const outside = result.layers.filter(
    layer => !isPackageLayer(layer) && isOutsideRoot(layer, result.rootDir),
  );
  if (outside.length > 0) {
    spots.push({ kind: 'outside-root', layers: outside.map(layer => layer.name) });
  }
  if (result.nuxtContent) {
    spots.push({ kind: 'nuxt-content' });
  }
  if (result.unreadFiles.length > 0) {
    spots.push({ kind: 'unreadable', files: result.unreadFiles });
  }
  return spots;
}
