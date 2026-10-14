/**
 * Scenario C, in one process: the analyzer that watch mode and the MCP server use, asked again
 * after nothing changed, after one file changed and after one file was added. It runs the stale
 * check on each run. The DevTools tab does not run this check.
 * Prints one JSON object. Run by `run.ts`, one process for each sample.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { computeEnvKey } from '#src/devtools/env-key.ts';

const root = process.argv[2];
if (root === undefined) {
  throw new Error('Usage: node bench/in-process.ts <project>');
}

const CHANGED = join(root, 'layers/shared/app/components/SharedCard0.vue');
// In a dir that no component or auto-import scan covers (lib/). The stale check does not find this
// file, so the run goes on and the step shows the cost of a new file.
const ADDED = join(root, 'layers/shared/app/lib/benchAdded.ts');
const original = readFileSync(CHANGED, 'utf8');

const analyzer = new Analyzer({
  rootDir: root,
  baseline: 'layerscope-baseline.json',
  // As watch mode and the MCP server do. The DevTools tab does not run the check again.
  analyze: { recheckStale: true },
  envKey: () => computeEnvKey(root, join(root, '.nuxt')),
});

interface Step {
  name: string;
  ms: number;
  rssMb: number;
  findings: number;
  files: number;
}

const steps: Step[] = [];

async function measure(name: string): Promise<void> {
  const start = performance.now();
  const { result } = await analyzer.refresh();
  const ms = performance.now() - start;
  steps.push({
    name,
    ms,
    rssMb: process.memoryUsage().rss / 1024 / 1024,
    findings: result.findings.length,
    files: result.files.length,
  });
}

let addedDir: string | undefined;

try {
  await measure('first');
  await measure('unchanged');
  appendFileSync(CHANGED, '<!-- changed by the benchmark -->\n');
  await measure('one-changed');
  // The first dir that this makes, or undefined when the dir is there.
  addedDir = mkdirSync(dirname(ADDED), { recursive: true });
  writeFileSync(ADDED, 'export function benchAdded(): number {\n  return 1;\n}\n');
  await measure('one-added');
} finally {
  writeFileSync(CHANGED, original);
  rmSync(addedDir ?? ADDED, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ steps, maxRssKb: process.resourceUsage().maxRSS })}\n`);
