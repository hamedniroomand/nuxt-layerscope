import { relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { planMoves } from '#src/fix/plan.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';

import { applyPlan } from './fix-project.ts';
import { PROJECTS, SEEDS, baselineFile, randomFrom, writeProject } from './fix-random-project.ts';
import type { Random } from './fix-random-project.ts';

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

/**
 * A property test for the promise of `fix`: when its plan is applied, `check` shows no cycle that
 * it did not show before, and no unresolved reference. The projects are random but the seeds are
 * fixed, so a failure can be run again. The number of projects is small, to keep the run short.
 */
describe('applying the plan of fix', () => {
  it.each(SEEDS)('shows no new cycle and no unresolved reference (seed %i)', async seed => {
    const random = randomFrom(seed);
    for (let index = 0; index < PROJECTS; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- one project at a time, in the same order
      expect(await checkProject(random), `project ${index} of seed ${seed}`).toEqual([]);
    }
  });
});
