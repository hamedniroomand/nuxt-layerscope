import type { AnalyzeResult } from '#src/types.ts';

import type { TabFinding, TabReport } from './protocol.ts';
import { hotFiles, layerStats } from './stats.ts';

type JsonReport = Omit<TabReport, 'absRoot' | 'hotFiles' | 'layerStats'>;

/** The `check --format json` report plus what the tab needs: absolute paths and statistics. */
export async function tabReport(result: AnalyzeResult): Promise<TabReport> {
  // Loaded on request, so the report code stays out of Nuxt's startup.
  const { formatResult } = await import('#src/report/index.ts');
  const { rootDir } = result;
  const report = JSON.parse(formatResult(result, 'json', rootDir)) as JsonReport;
  // The JSON report keeps the order of `result.findings`, so the indexes line up.
  const findings = report.findings.map((finding, index): TabFinding => ({
    ...finding,
    absFile: result.findings[index]?.file ?? finding.file,
    absTarget: result.findings[index]?.target ?? null,
  }));
  return {
    ...report,
    absRoot: rootDir,
    findings,
    hotFiles: hotFiles(result.findings, rootDir),
    layerStats: layerStats(result),
  };
}
