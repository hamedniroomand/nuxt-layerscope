import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, arch, platform, release, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateProject, PROJECT_DIR } from './generate.ts';
import type { Row, Summary } from './stats.ts';
import { formatTable, megabytes, parseBenchArgs, summarize } from './stats.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BIN = join(HERE, '../dist/bin.mjs');
const HOOK = join(HERE, 'rss-hook.mjs');
const IN_PROCESS = join(HERE, 'in-process.ts');
const PACKAGE = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')) as {
  version: string;
};

interface Timed {
  ms: number;
  maxRssKb: number;
  status: number;
  stdout: string;
}

/** Runs the built CLI in a fresh process and measures wall time and peak memory. */
function runCli(project: string, args: string[]): Timed {
  const rssFile = join(mkdtempSync(join(tmpdir(), 'layerscope-bench-')), 'rss');
  const start = process.hrtime.bigint();
  const result = spawnSync(
    process.execPath,
    ['--import', HOOK, BIN, 'check', project, '--format', 'json', ...args],
    { env: { ...process.env, BENCH_RSS_FILE: rssFile }, encoding: 'utf8', maxBuffer: 1 << 28 },
  );
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const maxRssKb = existsSync(rssFile) ? Number(readFileSync(rssFile, 'utf8')) : Number.NaN;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`layerscope check exited with ${String(result.status)}:\n${result.stderr}`);
  }
  return { ms, maxRssKb, status: result.status, stdout: result.stdout };
}

function findingsOf(timed: Timed): number {
  return (JSON.parse(timed.stdout) as { findings: unknown[] }).findings.length;
}

function expectFindings(actual: number, expected: number | undefined, where: string): void {
  if (expected !== undefined && actual !== expected) {
    // A run that found the wrong number of findings measured the wrong work.
    throw new Error(`${where}: expected ${expected} findings, got ${actual}`);
  }
}

function memory(samples: number[]): Summary {
  return summarize(samples.map(kb => megabytes(kb)));
}

function scenarioA(project: string, runs: number, expected: number | undefined): Row {
  runCli(project, []);
  const samples = Array.from({ length: runs }, () => {
    const timed = runCli(project, []);
    expectFindings(findingsOf(timed), expected, 'A');
    return timed;
  });
  return {
    scenario: 'One-shot `check`, `.nuxt` ready (a fresh process)',
    time: summarize(samples.map(sample => sample.ms)),
    memory: memory(samples.map(sample => sample.maxRssKb)),
  };
}

function scenarioB(project: string, runs: number, expected: number | undefined): Row {
  const samples = Array.from({ length: runs }, () => {
    rmSync(join(project, '.nuxt'), { recursive: true, force: true });
    const timed = runCli(project, ['--prepare']);
    expectFindings(findingsOf(timed), expected, 'B');
    return timed;
  });
  return {
    scenario: 'One-shot `check --prepare`, no `.nuxt` (includes `nuxi prepare`)',
    time: summarize(samples.map(sample => sample.ms)),
    memory: memory(samples.map(sample => sample.maxRssKb)),
    note: 'memory of the layerscope process only; the nuxi prepare child is not included',
  };
}

interface InProcess {
  steps: { name: string; ms: number; rssMb: number; findings: number; files: number }[];
}

const LABELS: Record<string, string> = {
  first: 'In one process: first analysis',
  unchanged: 'In one process: again, nothing changed (cached)',
  'one-changed': 'In one process: after one file changed (cached)',
  'one-added': 'In one process: after one file was added',
};

/** Every step must report the same findings, and the added file must show in the file count. */
function expectSteps(run: InProcess, expected: number | undefined): void {
  for (const step of run.steps) {
    expectFindings(step.findings, expected, `C ${step.name}`);
  }
  const first = run.steps.find(step => step.name === 'first');
  const added = run.steps.find(step => step.name === 'one-added');
  if (first === undefined || added === undefined || added.files !== first.files + 1) {
    throw new Error(
      `C one-added: expected ${(first?.files ?? Number.NaN) + 1} files, got ${added?.files}`,
    );
  }
}

function scenarioC(project: string, runs: number, expected: number | undefined): Row[] {
  const samples = Array.from({ length: runs }, () => {
    const result = spawnSync(process.execPath, [IN_PROCESS, project], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
    if (result.status !== 0) {
      throw new Error(`in-process run failed:\n${result.stderr}`);
    }
    const run = JSON.parse(result.stdout) as InProcess;
    expectSteps(run, expected);
    return run;
  });
  return Object.keys(LABELS).map(name => {
    const own = samples.map(sample => sample.steps.find(step => step.name === name));
    return {
      scenario: LABELS[name] ?? name,
      time: summarize(own.map(step => step?.ms ?? Number.NaN)),
      memory: summarize(own.map(step => step?.rssMb ?? Number.NaN)),
    };
  });
}

function describeMachine(): string {
  const cpu = cpus();
  return [
    `- layerscope ${PACKAGE.version}, Node ${process.version}`,
    `- ${platform()} ${release()} (${arch()}), ${cpu[0]?.model ?? 'unknown CPU'}, ${cpu.length} cores, ${Math.round(totalmem() / 1024 ** 3)} GB RAM`,
    `- ${new Date().toISOString().slice(0, 10)}`,
  ].join('\n');
}

function main(): void {
  const args = parseBenchArgs(process.argv.slice(2));
  const only = new Set(args.only);
  let expected: number | undefined;
  let project = args.project;
  let shape = '';
  if (project === undefined) {
    project = PROJECT_DIR;
    if (args.generate || !existsSync(project)) {
      process.stderr.write(`Generating a project of ${args.files} files and preparing it...\n`);
      const plan = generateProject({ files: args.files });
      expected = plan.expectedFindings;
      shape = `${plan.sourceFiles} source files in ${plan.layers.length} layers, ${plan.expectedFindings} findings`;
    } else {
      const meta = JSON.parse(readFileSync(join(project, 'bench.json'), 'utf8')) as {
        sourceFiles: number;
        layers: number;
        expectedFindings: number;
      };
      expected = meta.expectedFindings;
      shape = `${meta.sourceFiles} source files in ${meta.layers} layers, ${meta.expectedFindings} findings`;
    }
  }
  if ((only.has('A') || only.has('B')) && !existsSync(BIN)) {
    throw new Error('dist/bin.mjs is missing: run "vp run build" first.');
  }
  const rows: Row[] = [];
  if (only.has('A')) {
    rows.push(scenarioA(project, args.runs ?? 7, expected));
  }
  if (only.has('C') && args.project === undefined) {
    rows.push(...scenarioC(project, args.runs ?? 7, expected));
  }
  if (only.has('B') && args.project === undefined) {
    rows.push(scenarioB(project, args.runs === undefined ? 3 : Math.min(args.runs, 3), expected));
  }
  const table = formatTable(rows);
  process.stdout.write(`${describeMachine()}\n- ${shape || `project: ${project}`}\n\n${table}`);
  if (args.json !== undefined) {
    writeFileSync(args.json, `${JSON.stringify({ shape, rows }, null, 2)}\n`);
  }
}

main();
