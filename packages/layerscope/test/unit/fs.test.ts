import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { isFile, readJson, realPath } from '#src/utils/fs.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'layerscope-fs-'));
}

describe('isFile', () => {
  it('is true for files only', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.txt'), '');
    expect(isFile(join(dir, 'a.txt'))).toBe(true);
    expect(isFile(dir)).toBe(false);
    expect(isFile(join(dir, 'missing'))).toBe(false);
  });
});

describe('readJson', () => {
  it('parses JSON with whole-line comments, as in user tsconfigs', () => {
    const file = join(tempDir(), 'tsconfig.json');
    writeFileSync(file, '{\n  // extends the Nuxt config\n  "extends": "./.nuxt/tsconfig.json"\n}');
    expect(readJson(file)).toEqual({ extends: './.nuxt/tsconfig.json' });
  });

  it('keeps slashes inside strings', () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '{"url": "https://example.com"}');
    expect(readJson(file)).toEqual({ url: 'https://example.com' });
  });
});

describe('realPath', () => {
  it('follows symlinks', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'real'));
    symlinkSync(join(dir, 'real'), join(dir, 'link'));
    expect(realPath(join(dir, 'link'))).toBe(realPath(join(dir, 'real')));
  });

  it('returns a missing path unchanged', () => {
    expect(realPath('/nonexistent/path')).toBe('/nonexistent/path');
  });
});
