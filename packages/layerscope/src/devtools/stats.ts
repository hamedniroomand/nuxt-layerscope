import { relative } from 'pathe';

import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { HotFile, LayerStat } from './protocol.ts';

const HOT_FILES = 8;

function compareHot(a: HotFile, b: HotFile): number {
  return b.errors - a.errors || b.warnings - a.warnings || compareStrings(a.file, b.file);
}

/** Files ranked by findings, worst severity first. */
export function hotFiles(findings: Finding[], rootDir: string): HotFile[] {
  const byFile = new Map<string, HotFile>();
  for (const finding of findings) {
    const entry = byFile.get(finding.file) ?? {
      file: relative(rootDir, finding.file),
      absFile: finding.file,
      errors: 0,
      warnings: 0,
    };
    if (finding.severity === 'error') {
      entry.errors += 1;
    } else {
      entry.warnings += 1;
    }
    byFile.set(finding.file, entry);
  }
  return [...byFile.values()].toSorted(compareHot).slice(0, HOT_FILES);
}

function countBy<T>(items: T[], keyOf: (item: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== null) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Per layer: root, `allow` list, file count and references across layer borders. */
export function layerStats(result: AnalyzeResult): LayerStat[] {
  const ownerOf = createOwnerLookup(result.layers);
  const crossing = result.edges.filter(
    edge => edge.toLayer !== null && edge.toLayer !== edge.fromLayer,
  );
  const refsOut = countBy(crossing, edge => edge.fromLayer);
  const refsIn = countBy(crossing, edge => edge.toLayer);
  const files = countBy(result.files, file => ownerOf(file)?.name ?? null);
  return result.layers.map(layer => ({
    name: layer.name,
    root: relative(result.rootDir, layer.root) || '.',
    allow: result.config.layers?.[layer.name]?.allow ?? null,
    files: files.get(layer.name) ?? 0,
    refsIn: refsIn.get(layer.name) ?? 0,
    refsOut: refsOut.get(layer.name) ?? 0,
  }));
}
