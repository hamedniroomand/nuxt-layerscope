import { describe, expect, it } from 'vite-plus/test';

import { ADMIN, SHARED, SHOP, WEB, cartProject, page, write } from './fix-project.ts';
import type { SuggestData } from './mcp-helpers.ts';
import { callTool, dataOf, sessionFor } from './mcp-helpers.ts';

const OLD = '../../../web/app/composables/useCart';

describe('suggest for a move', () => {
  it('gives the line and the column of each import to update', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    const first = `import { useCart as a } from '${OLD}';`;
    const second = `import { useCart as b } from '${OLD}';`;
    write(root, 'layers/admin/app/pages/admin.vue', page(`${first} ${second}`, 'a(); b();'));
    const file = 'layers/admin/app/pages/admin.vue';
    const result = dataOf<SuggestData>(await callTool('suggest', { file }, sessionFor(root)));
    const updates = result.suggestions[0].importsToUpdate as {
      file: string;
      line: number;
      column: number;
    }[];
    const mine = updates.filter(update => update.file === file);
    expect(mine.map(({ line, column }) => [line, column])).toEqual([
      [2, first.indexOf("'") + 1],
      [2, first.length + 1 + second.indexOf("'") + 1],
    ]);
  });
});
