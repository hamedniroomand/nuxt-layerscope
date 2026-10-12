import { describe, expect, it } from 'vite-plus/test';

import { isInside } from '#src/fix/git-state.ts';

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
