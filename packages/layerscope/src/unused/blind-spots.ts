import { isPackageLayer } from '#src/nuxt/package-layer.ts';
import type { AnalyzeResult, UnreadFile } from '#src/types.ts';

/** A kind of use that `unused` does not count. */
export type BlindSpot =
  | { kind: 'test-files' }
  | { kind: 'ignored' }
  | { kind: 'package-layers' }
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
  if (result.unreadFiles.length > 0) {
    spots.push({ kind: 'unreadable', files: result.unreadFiles });
  }
  return spots;
}
