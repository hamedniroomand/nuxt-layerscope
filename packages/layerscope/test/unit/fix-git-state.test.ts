import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { isInside, readState } from '#src/fix/git-state.ts';
import { git } from '#test/git-project.ts';

describe('isInside', () => {
  it('compares paths with forward slashes', () => {
    expect(isInside('/repo/a/b.ts', '/repo')).toBe(true);
    expect(isInside('/repo', '/repo')).toBe(false);
    expect(isInside('/repository/a.ts', '/repo')).toBe(false);
  });

  it('accepts a Windows path for the top of the repository', () => {
    // `git rev-parse` and `realpath` give backslashes on Windows; the paths of the plan do not.
    expect(isInside('C:/repo/app/a.ts', 'C:\\repo')).toBe(true);
    expect(isInside('C:\\repo\\app\\a.ts', 'C:/repo/')).toBe(true);
    expect(isInside('D:/repo/a.ts', 'C:\\repo')).toBe(false);
  });
});

describe('readState', () => {
  it('keeps a tracked path that has a tab in its name', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-tab-')));
    git(root, 'init', '-q', '-b', 'main');
    writeFileSync(join(root, 'a\tb.ts'), 'export {};\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'tab');
    expect(readState(root).tracked.has(join(root, 'a\tb.ts'))).toBe(true);
  });
});
