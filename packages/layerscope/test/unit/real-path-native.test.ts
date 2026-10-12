import type * as NodeFs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type * as Fs from '#src/utils/fs.ts';
import { makeLayer } from '#test/factories.ts';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, realpathSync: Object.assign(vi.fn(), { native: vi.fn() }) };
});

let realPath: typeof Fs.realPath;
let native: ReturnType<typeof vi.fn>;
let js: { mockImplementation: (implementation: (path: string) => string) => unknown };

function missing(): never {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
}

function setPlatform(platform: NodeJS.Platform): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
}

/** A file system that answers like the native call of a case-insensitive or Windows system. */
function answer(table: Partial<Record<string, string>>): void {
  native.mockImplementation(((path: string) => {
    const real = table[path];
    if (real === undefined) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return real;
  }) as never);
}

beforeEach(async () => {
  // The test setup file loads `utils/fs.ts` before this mock exists, so the module is loaded again.
  vi.resetModules();
  const fs = await import('node:fs');
  native = vi.mocked(fs.realpathSync.native);
  js = vi.mocked(fs.realpathSync) as unknown as typeof js;
  js.mockImplementation(missing);
  ({ realPath } = await import('#src/utils/fs.ts'));
});

describe('realPath with the native result of another file system', () => {
  it('uses the real case that the file system gives, not the case of the import', () => {
    answer({ '/mono/Shop/app/composables/useCart.ts': '/mono/shop/app/composables/useCart.ts' });
    expect(realPath('/mono/Shop/app/composables/useCart.ts')).toBe(
      '/mono/shop/app/composables/useCart.ts',
    );
  });

  it('gives the layer of the real dir for an import with a wrong case', () => {
    answer({ '/mono/Shop/app/composables/useCart.ts': '/mono/shop/app/composables/useCart.ts' });
    const ownerOf = createOwnerLookup([
      makeLayer('root', '/mono'),
      makeLayer('shop', '/mono/shop'),
    ]);
    expect(ownerOf(realPath('/mono/Shop/app/composables/useCart.ts'))?.name).toBe('shop');
  });

  it('changes Windows separators to forward slashes', () => {
    answer({ 'C:\\proj\\shop\\app\\a.ts': 'C:\\proj\\shop\\app\\a.ts' });
    expect(realPath('C:\\proj\\shop\\app\\a.ts')).toBe('C:/proj/shop/app/a.ts');
  });

  it('makes the drive letter upper case', () => {
    answer({ 'c:\\proj\\a.ts': 'c:\\proj\\a.ts' });
    expect(realPath('c:\\proj\\a.ts')).toBe('C:/proj/a.ts');
  });
});

describe('realPath on a volume that the native call changes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a native result that has another first segment on POSIX (/var is /private/var)', () => {
    setPlatform('darwin');
    answer({ '/var/folders/x': '/private/var/folders/x' });
    expect(realPath('/var/folders/x')).toBe('/private/var/folders/x');
  });

  it('uses the JS result when the native call gives another drive (a subst drive)', () => {
    setPlatform('win32');
    answer({ 'S:\\proj\\a.ts': 'C:\\real\\proj\\a.ts' });
    js.mockImplementation(() => 'S:\\proj\\a.ts');
    expect(realPath('S:\\proj\\a.ts')).toBe('S:/proj/a.ts');
  });

  it('uses the JS result when the native call gives a UNC path (a mapped drive)', () => {
    setPlatform('win32');
    answer({ 'Z:\\proj\\a.ts': '\\\\server\\share\\proj\\a.ts' });
    js.mockImplementation(() => 'Z:\\proj\\a.ts');
    expect(realPath('Z:\\proj\\a.ts')).toBe('Z:/proj/a.ts');
  });

  it('does not read a POSIX path with a double slash as a Windows share', () => {
    // Only `volumeOf` on win32 may look at the share: here it would see `//srv/share` and `''`.
    setPlatform('darwin');
    answer({ '//srv/share/a.ts': '/real/a.ts' });
    js.mockImplementation(() => '//srv/share/a.ts');
    expect(realPath('//srv/share/a.ts')).toBe('/real/a.ts');
  });

  it('keeps a native result on the same drive, with another case', () => {
    setPlatform('win32');
    answer({ 'c:\\Proj\\a.ts': 'C:\\proj\\a.ts' });
    expect(realPath('c:\\Proj\\a.ts')).toBe('C:/proj/a.ts');
  });

  it('uses the JS result when the native call throws', () => {
    answer({});
    js.mockImplementation(() => '/mono/real/a.ts');
    expect(realPath('/mono/link/a.ts')).toBe('/mono/real/a.ts');
  });
});

describe('the owner of a file when the native paths have Windows separators', () => {
  it('finds the owner of a file when the native paths have backslashes', () => {
    answer({
      'C:\\proj': 'C:\\proj',
      'C:\\proj\\layers\\shop': 'C:\\proj\\layers\\shop',
      'C:\\proj\\layers\\shop\\app\\a.ts': 'C:\\proj\\layers\\shop\\app\\a.ts',
      'C:\\proj\\app\\b.ts': 'C:\\proj\\app\\b.ts',
    });
    const ownerOf = createOwnerLookup([
      makeLayer('root', realPath('C:\\proj')),
      makeLayer('shop', realPath('C:\\proj\\layers\\shop')),
    ]);
    // tinyglobby returns forward slashes, and the layer roots come from `realPath`.
    expect(ownerOf('C:/proj/layers/shop/app/a.ts')?.name).toBe('shop');
    expect(ownerOf(realPath('C:\\proj\\layers\\shop\\app\\a.ts'))?.name).toBe('shop');
    expect(ownerOf(realPath('C:\\proj\\app\\b.ts'))?.name).toBe('root');
  });
});
