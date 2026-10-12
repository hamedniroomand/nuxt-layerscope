import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

import { dirname, join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, run } from '#src/cli.ts';
import { planMoves } from '#src/fix/plan.ts';
import type { AnalyzeResult } from '#src/types.ts';

import { commitAll } from './fix-apply-project.ts';
import { PROJECTS, SEEDS, baselineFile, randomFrom, writeProject } from './fix-random-project.ts';
import { git } from './git-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The oracle for `fix --apply`: in a git repository, the real command runs on random projects.
 * Then `check` must show no cycle that it did not show before, no unresolved reference, and the
 * boundary findings that no move clears. Each relative import in the project must point at a
 * file, and a moved file must have the text of the old file except its import specifiers.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === '.git') {
      return [];
    }
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

const SPECIFIER = /from (['"])([^'"]*)\1/gu;

/** The text without the specifiers: the rest of a moved file must stay the same. */
function masked(text: string): string {
  return text.replaceAll(SPECIFIER, 'from ?');
}

/** Relative imports of the files in `layers/` that point at no file. */
function brokenImports(root: string): string[] {
  return sourceFiles(join(root, 'layers')).flatMap(file =>
    [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
      .map(match => match[2])
      .filter(specifier => specifier.startsWith('.'))
      .filter(specifier => !existsSync(`${join(dirname(file), specifier)}.ts`))
      .map(specifier => `${relative(root, file)} → ${specifier}`),
  );
}

function boundaryCount(result: AnalyzeResult): number {
  return result.findings.filter(
    finding => finding.rule === 'layer-boundary' || finding.rule === 'layer-internal',
  ).length;
}

async function applyProject(random: () => number): Promise<string[]> {
  const { root, files } = writeProject(random);
  const baseline = await baselineFile(root, random, files);
  const before = await analyze({ rootDir: root, baseline });
  const moves = planMoves(before);
  if (moves.length === 0) {
    return [];
  }
  commitAll(root);
  const texts = new Map(moves.map(move => [move.to, masked(readFileSync(move.from, 'utf8'))]));
  const flags = baseline === undefined ? [] : ['--baseline', baseline];
  const code = await run(['node', 'layerscope', 'fix', root, '--apply', ...flags]);
  const after = await analyze({ rootDir: root, baseline });
  // The `check` command must agree with the analysis: exit 1 only when an error is left.
  const checked = await run(['node', 'layerscope', 'check', root, ...flags]);
  const errors = after.findings.some(finding => finding.severity === 'error');
  const known = new Set(
    before.findings.filter(finding => finding.rule === 'layer-cycle').map(({ symbol }) => symbol),
  );
  const moved = new Set(moves.map(move => move.from));
  const left = before.findings.filter(
    finding =>
      (finding.rule === 'layer-boundary' || finding.rule === 'layer-internal') &&
      !moved.has(finding.file) &&
      !(finding.target !== null && moved.has(finding.target)),
  ).length;
  return [
    ...(code === EXIT_CLEAN ? [] : [`exit code ${code}`]),
    ...(checked === (errors ? 1 : 0) ? [] : [`check exit code ${checked}, errors left: ${errors}`]),
    ...after.findings
      .filter(finding =>
        finding.rule === 'layer-cycle'
          ? !known.has(finding.symbol)
          : finding.rule !== 'layer-boundary' && finding.rule !== 'layer-internal',
      )
      .map(finding => `${finding.rule} ${finding.symbol} in ${relative(root, finding.file)}`),
    ...(boundaryCount(after) === left
      ? []
      : [`boundary findings: ${boundaryCount(after)}, expected ${left}`]),
    ...brokenImports(root).map(text => `broken import ${text}`),
    ...[...texts]
      .filter(([to, text]) => masked(readFileSync(to, 'utf8')) !== text)
      .map(([to]) => `text of ${relative(root, to)} changed`),
    ...(/^R/mu.test(git(root, 'status', '--porcelain')) ? [] : ['no rename in git']),
  ];
}

describe('applying fix --apply to random projects', () => {
  it.each(SEEDS)('leaves a tree that check accepts (seed %i)', async seed => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const random = randomFrom(seed);
    for (let index = 0; index < PROJECTS; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- one project at a time, in the same order
      expect(await applyProject(random), `project ${index} of seed ${seed}`).toEqual([]);
    }
  });
});
