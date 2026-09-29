import type { Graph } from '#src/graph/index.ts';
import { JSON_REPORT_VERSION } from '#src/report/json.ts';

export function formatGraphJson(graph: Graph): string {
  return `${JSON.stringify({ version: JSON_REPORT_VERSION, ...graph }, null, 2)}\n`;
}
