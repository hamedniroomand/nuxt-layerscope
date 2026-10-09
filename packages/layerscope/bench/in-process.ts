/**
 * Scenario C, in one process: the analyzer that watch mode, the MCP server and the DevTools tab
 * use, asked again after nothing changed, after one file changed and after one file was added.
 * Prints one JSON object. Run by `run.ts`, one process for each sample.
 */
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { computeEnvKey } from '#src/devtools/env-key.ts';

const root = process.argv[2];
if (root === undefined) {
  throw new Error('Usage: node bench/in-process.ts <project>');
}

const CHANGED = join(root, 'layers/shared/app/components/SharedCard0.vue');
const ADDED = join(root, 'layers/shared/app/composables/useSharedBenchAdded.ts');
const original = readFileSync(CHANGED, 'utf8');

const analyzer = new Analyzer({
  rootDir: root,
  baseline: 'layerscope-baseline.json',
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

try {
  await measure('first');
  await measure('unchanged');
  appendFileSync(CHANGED, '<!-- changed by the benchmark -->\n');
  await measure('one-changed');
  writeFileSync(ADDED, 'export function useSharedBenchAdded(): number {\n  return 1;\n}\n');
  await measure('one-added');
} finally {
  writeFileSync(CHANGED, original);
  rmSync(ADDED, { force: true });
}

process.stdout.write(`${JSON.stringify({ steps, maxRssKb: process.resourceUsage().maxRSS })}\n`);
