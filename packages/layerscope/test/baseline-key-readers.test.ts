import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { measureDrift } from '#src/drift/index.ts';
import { ProjectSession } from '#src/mcp/session.ts';
import { createWatchAnalyzer } from '#src/watch/analyzer.ts';

import { KEY, keyProject } from './baseline-key-project.ts';
import { commit, counts } from './drift-project.ts';
import { check } from './git-project.ts';

describe('the baseline key of the config, in drift, watch and MCP', () => {
  it('names the file that drift reads on the base ref and in the working tree', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    commit(root, 'accept');
    const result = await measureDrift({ rootDir: root }, 'main');
    expect(counts(result)).toEqual([0, 0]);
    expect(result.baselineSize).toEqual({ base: 1, current: 1 });
  });

  it('applies in the analyzer of check --watch', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    const { result } = await createWatchAnalyzer({ rootDir: root, envKey: () => 'key' }).get();
    expect(result.baseline?.file).toBe(join(root, KEY));
    expect(result.baseline?.suppressed).toHaveLength(1);
  });

  it('applies in the MCP server', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    const result = await new ProjectSession({ rootDir: root, source: 'auto' }).result();
    expect(result.baseline?.file).toBe(join(root, KEY));
    expect(result.baseline?.suppressed).toHaveLength(1);
  });
});
