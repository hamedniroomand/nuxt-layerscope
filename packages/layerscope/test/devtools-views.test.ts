import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { allowHint } from '#src/devtools/hints.ts';
import { boundaryFindings } from '#src/rules/layer-boundary.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

let result: AnalyzeResult;

beforeAll(async () => {
  result = await analyze({ rootDir: NUXT4_ROOT });
}, 60_000);

function pairCount(findings: Finding[], from: string, to: string): number {
  return findings.filter(finding => finding.fromLayer === from && finding.toLayer === to).length;
}

describe('allow hint on the nuxt4 fixture', () => {
  it('resolves exactly the findings that allowing the layer clears', () => {
    const hinted = result.findings.flatMap(finding => {
      const hint = allowHint(finding, result);
      return hint === undefined ? [] : [{ finding, hint }];
    });
    expect(hinted.length).toBeGreaterThan(0);
    for (const { hint } of hinted) {
      const allow = result.config.layers?.[hint.layer]?.allow ?? [];
      const config = {
        ...result.config,
        layers: { ...result.config.layers, [hint.layer]: { allow: [...allow, hint.add] } },
      };
      // The cached edges, as the tab has them: no new analysis.
      const before = boundaryFindings(result.edges, result.config);
      const after = boundaryFindings(result.edges, config);
      expect(before.length - after.length).toBe(hint.resolves);
      expect(pairCount(after, hint.layer, hint.add)).toBe(0);
      expect(hint.snippet).toContain(`'${hint.add}'`);
    }
  });

  it('gives no hint for findings that are not boundary findings', () => {
    const others = result.findings.filter(finding => finding.rule !== 'layer-boundary');
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter(finding => allowHint(finding, result) !== undefined)).toEqual([]);
  });
});
