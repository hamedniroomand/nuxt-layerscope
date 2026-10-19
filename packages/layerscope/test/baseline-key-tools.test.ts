import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { run } from '#src/cli.ts';
import { ProjectSession } from '#src/mcp/session.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { silence } from '#test/fix-apply-project.ts';
import { cartProject, LAYERS } from '#test/fix-project.ts';
import { seen, start } from '#test/watch-session.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The cart project with the `baseline` key, and that baseline accepts its two boundary findings. */
async function cartKeyProject(): Promise<string> {
  const root = cartProject(LAYERS);
  writeFileSync(
    join(root, 'layerscope.config.mjs'),
    `export default { baseline: 'ci/b.json', layers: { ${LAYERS.join(', ')} } };\n`,
  );
  mkdirSync(join(root, 'ci'));
  silence();
  await run(['node', 'layerscope', 'check', root, '--update-baseline']);
  vi.restoreAllMocks();
  return root;
}

const boundary = (result: AnalyzeResult): number =>
  result.findings.filter(finding => finding.rule === 'layer-boundary').length;

describe('the baseline key of the config', () => {
  it('is read by analyze({ baseline: true })', async () => {
    const result = await analyze({ rootDir: await cartKeyProject(), baseline: true });
    expect(boundary(result)).toBe(0);
    expect(result.baseline?.file).toMatch(/ci\/b\.json$/u);
  });

  it('is read by fix, so fix plans no move for the accepted findings', async () => {
    const root = await cartKeyProject();
    const fix = async (): Promise<string> => {
      const output = silence();
      await run(['node', 'layerscope', 'fix', root, '--dry-run']);
      const text = output.stdout();
      vi.restoreAllMocks();
      return text;
    };
    const accepted = await fix();
    expect(accepted).toContain('No file moves suggested.');
    expect(accepted).not.toContain('layers/shared/');
    rmSync(join(root, 'ci/b.json'));
    expect(await fix()).toContain('layers/shared/');
  });
});

describe('--baseline over the baseline key', () => {
  it('wins in watch', async () => {
    const root = await cartKeyProject();
    const boundaryIn = async (baseline?: string): Promise<number> => {
      const session = start(root, 'json', false, { baseline });
      await seen(session.out, '"findings"');
      await session.stop();
      const report = JSON.parse(session.out.join('')) as { findings: { rule: string }[] };
      return report.findings.filter(finding => finding.rule === 'layer-boundary').length;
    };
    expect(await boundaryIn('other.json')).toBe(2);
    expect(await boundaryIn()).toBe(0);
  });

  it('wins in the MCP server', async () => {
    const root = await cartKeyProject();
    const over = new ProjectSession({ rootDir: root, source: 'auto', baseline: 'other.json' });
    expect(boundary(await over.result())).toBe(2);
    const key = new ProjectSession({ rootDir: root, source: 'auto' });
    expect(boundary(await key.result())).toBe(0);
  });
});
