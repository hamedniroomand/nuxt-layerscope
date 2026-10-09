import { describe, expect, it } from 'vite-plus/test';

import { baselineAt } from '#src/drift/git.ts';
import { gitProject } from '#test/git-project.ts';

describe('baselineAt', () => {
  it('reads a ref without a baseline file as an empty baseline', () => {
    const repo = gitProject();
    expect(baselineAt(repo.root, 'HEAD', 'layerscope-baseline.json')).toEqual({
      version: 1,
      entries: [],
    });
  });

  it('refuses a ref that does not exist', () => {
    const repo = gitProject();
    expect(() => baselineAt(repo.root, 'nope', 'layerscope-baseline.json')).toThrow(
      'Unknown git ref "nope"',
    );
  });
});
