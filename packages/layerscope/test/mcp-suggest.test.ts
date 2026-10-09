import { describe, expect, it } from 'vite-plus/test';

import type { SuggestData } from './mcp-helpers.ts';
import { callTool, dataOf } from './mcp-helpers.ts';

const PANEL = 'layers/admin/app/components/AdminPanel.vue';

describe('suggest', () => {
  it('gives the suggestion of each finding in a file', async () => {
    const result = dataOf<SuggestData>(await callTool('suggest', { file: PANEL }));
    expect(result.file).toBe(PANEL);
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const entry of result.suggestions) {
      expect(entry.finding.file).toBe(PANEL);
      expect(entry.suggestion.message).toBeTruthy();
    }
  });

  it('narrows to a line, a symbol and a rule', async () => {
    const all = dataOf<SuggestData>(await callTool('suggest', { file: PANEL }));
    const [first] = all.suggestions;
    const one = dataOf<SuggestData>(
      await callTool('suggest', {
        file: PANEL,
        line: first.finding.line,
        symbol: first.finding.symbol,
        rule: first.finding.rule,
      }),
    );
    expect(one.suggestions).toHaveLength(1);
    const none = dataOf<SuggestData>(
      await callTool('suggest', { file: PANEL, rule: 'layer-cycle' }),
    );
    expect(none.suggestions).toEqual([]);
  });

  it('refuses a file that layerscope does not check', async () => {
    const result = await callTool('suggest', { file: 'nuxt.config.ts' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not a file that layerscope checks');
  });
});
