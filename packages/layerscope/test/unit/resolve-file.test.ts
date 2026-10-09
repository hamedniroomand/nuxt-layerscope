import { describe, expect, it } from 'vite-plus/test';

import { resolveFile } from '#src/resolve/file.ts';
import { tempDir, write } from '#test/watch-project.ts';

describe('resolveFile and the CommonJS extensions', () => {
  it('finds a .cjs and a .cts file by name without an extension', () => {
    const root = tempDir();
    write(root, 'a.cjs', '');
    write(root, 'b.cts', '');
    expect(resolveFile(`${root}/a`)).toBe(`${root}/a.cjs`);
    expect(resolveFile(`${root}/b`)).toBe(`${root}/b.cts`);
  });

  it('keeps the order of before: .js and an index file come before .cjs and .cts', () => {
    const root = tempDir();
    write(root, 'x.cjs', '');
    write(root, 'x/index.ts', '');
    write(root, 'y.cts', '');
    write(root, 'y.js', '');
    expect(resolveFile(`${root}/x`)).toBe(`${root}/x/index.ts`);
    expect(resolveFile(`${root}/y`)).toBe(`${root}/y.js`);
  });

  it('turns a .cjs path into the .cts file when the .cjs file is missing', () => {
    const root = tempDir();
    write(root, 'z.cts', '');
    expect(resolveFile(`${root}/z.cjs`)).toBe(`${root}/z.cts`);
  });
});
