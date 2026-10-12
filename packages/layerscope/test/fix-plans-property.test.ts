import { writeFileSync } from 'node:fs';

import { join, relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { planMoves } from '#src/fix/plan.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';

import { applyPlan, empty, write } from './fix-project.ts';

/**
 * A property test for the promise of `fix`: when its plan is applied, `check` shows no cycle that
 * it did not show before, and no unresolved reference. The projects are random but the seeds are
 * fixed, so a failure can be run again. The number of projects is small, to keep the run short.
 */
const LAYERS = ['a', 'b', 'c', 'd', 's', 't'];
const SEEDS = [7, 1, 23, 51];
const PROJECTS = 8;
const MODES = ['none', 'all', 'some', 'stale', 'count'] as const;

type Random = () => number;

function randomFrom(seed: number): Random {
  let state = seed;
  return () => {
    // Park and Miller: the products stay below 2 ** 53, so the numbers are exact.
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

function pick<T>(random: Random, items: T[]): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

interface Source {
  name: string;
  layer: string;
  dir: string;
}

function pathOf(file: Source): string {
  return `layers/${file.layer}/app/${file.dir}/${file.name}.ts`;
}

function specifier(from: Source, to: Source): string {
  if (from.layer !== to.layer) {
    return `../../../${to.layer}/app/${to.dir}/${to.name}`;
  }
  return from.dir === to.dir ? `./${to.name}` : `../${to.dir}/${to.name}`;
}

/** Files in random layers, which import each other at random. */
function writeFiles(root: string, random: Random): Source[] {
  const count = 8 + Math.floor(random() * 8);
  const files = Array.from({ length: count }, (_, index) => ({
    name: `f${index}`,
    layer: pick(random, LAYERS),
    dir: pick(random, ['utils', 'composables']),
  }));
  for (const file of files) {
    const imports = files.filter(other => other !== file && random() < 0.18);
    const lines = imports.map(
      other => `import { ${other.name} as i_${other.name} } from '${specifier(file, other)}';`,
    );
    const names = imports.map(other => `i_${other.name}`);
    write(
      root,
      pathOf(file),
      `${lines.join('\n')}\nexport const ${file.name} = [${names.join(',')}];\n`,
    );
  }
  return files;
}

function writeProject(random: Random): { root: string; files: Source[] } {
  const layers = LAYERS.map(layer => {
    const allow = LAYERS.filter(other => other !== layer && random() < 0.45);
    return `${layer}: { path: 'layers/${layer}', allow: ${JSON.stringify(allow)} }`;
  });
  const root = empty(`${layers.join(',')} }, rules: { 'layer-cycle': 'error'`);
  return { root, files: writeFiles(root, random) };
}

interface Entry {
  rule: string;
  file: string;
  symbol: string;
  toLayer: string | null;
  count?: number;
}

/** A baseline with some of the cycles, all of them, entries for files that moved, or counts. */
function baselineEntries(random: Random, cycles: Entry[], files: Source[]): Entry[] {
  const mode = pick(random, [...MODES]);
  const any = (): string => pathOf(pick(random, files));
  if (mode === 'all') {
    return cycles;
  }
  if (mode === 'some') {
    return cycles.filter(() => random() < 0.5);
  }
  if (mode === 'count') {
    return cycles.map(entry => ({ ...entry, count: 2 }));
  }
  if (mode === 'stale') {
    const kept = cycles.filter(() => random() < 0.5);
    return [...kept, ...cycles.map(entry => ({ ...entry, file: any() }))];
  }
  return [];
}

async function baselineFile(
  root: string,
  random: Random,
  files: Source[],
): Promise<string | undefined> {
  const found = await analyze({ rootDir: root });
  const cycles = found.findings
    .filter(finding => finding.rule === 'layer-cycle')
    .map(({ rule, file, symbol, toLayer }) => ({
      rule,
      file: relative(root, file),
      symbol,
      toLayer,
    }));
  const entries = baselineEntries(random, cycles, files);
  if (entries.length === 0) {
    return undefined;
  }
  writeFileSync(join(root, 'b.json'), JSON.stringify({ version: 1, entries }));
  return 'b.json';
}

function isBoundary(finding: Finding): boolean {
  return finding.rule === 'layer-boundary' || finding.rule === 'layer-internal';
}

function moved(result: AnalyzeResult): Set<string> {
  return new Set(planMoves(result).map(move => move.from));
}

/** The boundary and internal findings that are not in a moved file and do not point at one. */
function countBoundary(result: AnalyzeResult, files: Set<string>): number {
  return result.findings.filter(
    finding =>
      isBoundary(finding) &&
      !files.has(finding.file) &&
      !(finding.target !== null && files.has(finding.target)),
  ).length;
}

async function checkProject(random: Random): Promise<string[]> {
  const { root, files } = writeProject(random);
  const baseline = await baselineFile(root, random, files);
  const before = await analyze({ rootDir: root, baseline });
  if (planMoves(before).length === 0) {
    return [];
  }
  await applyPlan(root, baseline);
  const after = await analyze({ rootDir: root, baseline });
  const known = new Set(
    before.findings
      .filter(finding => finding.rule === 'layer-cycle')
      .map(finding => finding.symbol),
  );
  const problems = after.findings
    .filter(finding =>
      finding.rule === 'layer-cycle'
        ? !known.has(finding.symbol)
        : finding.rule !== 'layer-boundary' && finding.rule !== 'layer-internal',
    )
    .map(finding => `${finding.rule} ${finding.symbol} in ${relative(root, finding.file)}`);
  const left = countBoundary(before, moved(before));
  const now = after.findings.filter(isBoundary).length;
  return now === left ? problems : [...problems, `boundary findings: ${now}, expected ${left}`];
}

describe('applying the plan of fix', () => {
  it.each(SEEDS)('shows no new cycle and no unresolved reference (seed %i)', async seed => {
    const random = randomFrom(seed);
    for (let index = 0; index < PROJECTS; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- one project at a time, in the same order
      expect(await checkProject(random), `project ${index} of seed ${seed}`).toEqual([]);
    }
  });
});
