import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plan, PlanOptions } from './plan.ts';
import { planProject } from './plan.ts';

/** Git-ignored, and left out of formatting, linting, type checking and tests. */
export const PROJECT_DIR = fileURLToPath(new URL('./.project', import.meta.url));

export function writePlan(plan: Plan, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  for (const file of plan.files) {
    const target = join(dir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  writeFileSync(
    join(dir, 'bench.json'),
    `${JSON.stringify({ sourceFiles: plan.sourceFiles, layers: plan.layers.length, expectedFindings: plan.expectedFindings })}\n`,
  );
}

export function prepareProject(dir: string): void {
  execFileSync('npx', ['--no-install', 'nuxi', 'prepare'], { cwd: dir, stdio: 'pipe' });
}

export interface GenerateOptions extends PlanOptions {
  dir?: string;
  /** Run `nuxi prepare` so the project has the files layerscope reads. Default `true`. */
  prepare?: boolean;
}

/** Writes the project and, by default, prepares it. */
export function generateProject(options: GenerateOptions = {}): Plan {
  const dir = options.dir ?? PROJECT_DIR;
  const plan = planProject(options);
  writePlan(plan, dir);
  if (options.prepare !== false) {
    prepareProject(dir);
  }
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--files');
  const files = index === -1 ? 3000 : Number(process.argv[index + 1]);
  const plan = generateProject({ files });
  process.stdout.write(
    `Wrote ${plan.sourceFiles} source files in ${plan.layers.length} layers to ${PROJECT_DIR}; ` +
      `layerscope must report ${plan.expectedFindings} findings.\n`,
  );
}
