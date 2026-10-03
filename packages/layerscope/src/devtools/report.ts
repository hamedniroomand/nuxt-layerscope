import type { AnalyzeResult } from '#src/types.ts';

import { allowHint } from './hints.ts';
import type { TabFinding, TabReport } from './protocol.ts';
import { hotFiles, layerStats } from './stats.ts';

type JsonReport = Omit<TabReport, 'absRoot' | 'hotFiles' | 'layerStats' | 'newCount'>;

/** Per finding, in report order: its key and whether it is new since the marker. */
export interface FindingMarks {
  keys: string[];
  isNew: boolean[];
}

/** The `check --format json` report plus what the tab needs: absolute paths and statistics. */
export async function tabReport(result: AnalyzeResult, marks: FindingMarks): Promise<TabReport> {
  // Loaded on request, so the report code stays out of Nuxt's startup.
  const { formatResult } = await import('#src/report/index.ts');
  const { rootDir } = result;
  const report = JSON.parse(formatResult(result, 'json', rootDir)) as JsonReport;
  // The JSON report keeps the order of `result.findings`, so the indexes line up.
  const findings = report.findings.map((finding, index): TabFinding => {
    const raw = result.findings.at(index);
    const hint = raw === undefined ? undefined : allowHint(raw, result);
    return {
      ...finding,
      absFile: raw?.file ?? finding.file,
      absTarget: raw?.target ?? null,
      key: marks.keys[index] ?? '',
      isNew: marks.isNew[index] ?? false,
      ...(hint && { hint }),
    };
  });
  return {
    ...report,
    absRoot: rootDir,
    findings,
    hotFiles: hotFiles(result.findings, rootDir),
    layerStats: layerStats(result),
    newCount: marks.isNew.filter(Boolean).length,
  };
}
