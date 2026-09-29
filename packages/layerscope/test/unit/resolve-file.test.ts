import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { resolveFile } from '#src/resolve/file.ts';

let dir = '';

function touch(relativePath: string): string {
  const file = join(dir, relativePath);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, '');
  return file;
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-resolve-file-')));
});

describe('resolveFile', () => {
  it('returns an exact file as is', () => {
    const file = touch('a.css');
    expect(resolveFile(file)).toBe(file);
  });

  it('adds a known extension', () => {
    const file = touch('utils.ts');
    expect(resolveFile(join(dir, 'utils'))).toBe(file);
  });

  it('prefers TypeScript over other extensions', () => {
    touch('utils.js');
    const ts = touch('utils.ts');
    expect(resolveFile(join(dir, 'utils'))).toBe(ts);
  });

  it('maps a .js specifier to its .ts source', () => {
    const file = touch('helper.ts');
    expect(resolveFile(join(dir, 'helper.js'))).toBe(file);
  });

  it('maps a .mjs specifier to its .mts source', () => {
    const file = touch('helper.mts');
    expect(resolveFile(join(dir, 'helper.mjs'))).toBe(file);
  });

  it('falls back to a directory index', () => {
    const file = touch('composables/index.ts');
    expect(resolveFile(join(dir, 'composables'))).toBe(file);
  });

  it('returns null when nothing matches', () => {
    expect(resolveFile(join(dir, 'missing'))).toBeNull();
  });

  it('does not resolve a bare directory', () => {
    mkdirSync(join(dir, 'empty'));
    expect(resolveFile(join(dir, 'empty'))).toBeNull();
  });
});
