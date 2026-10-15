import { describe, expect, it } from 'vite-plus/test';

import { newSpecifier } from '#src/fix/specifier.ts';
import { makeEdge } from '#test/factories.ts';

describe('newSpecifier', () => {
  it('returns null for aliases and package imports', () => {
    expect(
      newSpecifier(
        makeEdge({ symbol: '~/composables/useCart', to: '/app/x.ts' }),
        '/a.ts',
        '/b.ts',
      ),
    ).toBeNull();
    expect(newSpecifier(makeEdge({ symbol: '#imports', to: null }), '/a.ts', '/b.ts')).toBeNull();
  });

  it('rewrites a relative specifier to the new locations', () => {
    const edge = makeEdge({
      symbol: '../composables/useCart',
      to: '/app/layers/shop/composables/useCart.ts',
    });
    expect(
      newSpecifier(edge, '/app/pages/index.vue', '/app/layers/web/composables/useCart.ts'),
    ).toBe('../layers/web/composables/useCart');
  });

  it('keeps the extension when the original specifier had one', () => {
    const edge = makeEdge({
      symbol: './useCart.ts',
      to: '/app/composables/useCart.ts',
    });
    expect(newSpecifier(edge, '/app/composables/index.ts', '/app/utils/useCart.ts')).toBe(
      '../utils/useCart.ts',
    );
  });

  it('drops a trailing index when the original did', () => {
    const edge = makeEdge({
      symbol: '../utils',
      to: '/app/utils/index.ts',
    });
    expect(newSpecifier(edge, '/app/pages/a.ts', '/app/lib/index.ts')).toBe('../lib');
  });

  it('prefixes ./ when the relative path would otherwise be bare', () => {
    const edge = makeEdge({
      symbol: './sibling',
      to: '/app/a/sibling.ts',
    });
    expect(newSpecifier(edge, '/app/a/file.ts', '/app/a/other.ts')).toBe('./other');
  });
});

describe('newSpecifier: the style of the user', () => {
  it('keeps the extension that the user wrote, also when the file has another one', () => {
    const edge = makeEdge({ symbol: './foo.js', file: '/app/a/x.ts', to: '/app/a/foo.ts' });
    expect(newSpecifier(edge, '/app/a/x.ts', '/app/b/foo.ts')).toBe('../b/foo.js');
  });

  it('keeps the query', () => {
    const edge = makeEdge({ symbol: './Comp.vue?raw', file: '/app/a/x.ts', to: '/app/a/Comp.vue' });
    expect(newSpecifier(edge, '/app/a/x.ts', '/app/b/Comp.vue')).toBe('../b/Comp.vue?raw');
  });

  it('drops the whole .d.ts extension when the user did not write one', () => {
    const edge = makeEdge({ symbol: './types', file: '/app/a/x.ts', to: '/app/a/types.d.ts' });
    expect(newSpecifier(edge, '/app/a/x.ts', '/app/b/types.d.ts')).toBe('../b/types');
  });

  it('keeps a dir import that ends with a name like index', () => {
    const edge = makeEdge({
      symbol: './reindex',
      file: '/app/a/x.ts',
      to: '/app/a/reindex/index.ts',
    });
    expect(newSpecifier(edge, '/app/a/x.ts', '/app/b/reindex/index.ts')).toBe('../b/reindex');
  });

  it('keeps an explicit index when the user wrote it', () => {
    const edge = makeEdge({
      symbol: './dir/index',
      file: '/app/a/x.ts',
      to: '/app/a/dir/index.ts',
    });
    expect(newSpecifier(edge, '/app/a/x.ts', '/app/b/dir/index.ts')).toBe('../b/dir/index');
  });
});

describe('newSpecifier: dir and index imports', () => {
  it('keeps a dir import when both files end in the same dir', () => {
    const edge = makeEdge({ symbol: '../lib', file: '/r/x/a.ts', to: '/r/lib/index.ts' });
    expect(newSpecifier(edge, '/r/lib/a.ts', '/r/lib/index.ts')).toBe('.');
  });

  it('keeps a dot import of the dir that holds the importer', () => {
    const edge = makeEdge({ symbol: '..', file: '/r/x/sub/a.ts', to: '/r/x/index.ts' });
    expect(newSpecifier(edge, '/r/y/a.ts', '/r/y/index.ts')).toBe('.');
  });

  it('keeps a trailing slash', () => {
    const edge = makeEdge({ symbol: './lib/', file: '/r/x/a.ts', to: '/r/x/lib/index.ts' });
    expect(newSpecifier(edge, '/r/y/a.ts', '/r/x/lib/index.ts')).toBe('../x/lib/');
  });

  it('keeps a dir import when the file was found through a link', () => {
    const edge = makeEdge({ symbol: './lib', file: '/r/x/a.ts', to: '/real/lib/index.ts' });
    expect(newSpecifier(edge, '/r/y/a.ts', '/real/lib/index.ts')).toBe('../../real/lib');
  });
});

describe('newSpecifier with a dot in the written name', () => {
  it('keeps a dotted file name with no written extension', () => {
    const edge = makeEdge({ symbol: './x.module', file: '/r/x/a.ts', to: '/r/x/x.module.ts' });
    expect(newSpecifier(edge, '/r/y/a.ts', '/r/x/x.module.ts')).toBe('../x/x.module');
  });

  it('keeps a dotted file name when the file was found through a link', () => {
    const edge = makeEdge({ symbol: './x.module', file: '/r/x/a.ts', to: '/real/x.module.ts' });
    expect(newSpecifier(edge, '/r/y/a.ts', '/real/x.module.ts')).toBe('../../real/x.module');
  });

  it('keeps a dotted dir name when the file was found through a link', () => {
    const edge = makeEdge({ symbol: './lib.v2', file: '/r/x/a.ts', to: '/real/lib.v2/index.ts' });
    expect(newSpecifier(edge, '/r/y/a.ts', '/real/lib.v2/index.ts')).toBe('../../real/lib.v2');
  });

  it('keeps the written extension of a dotted name found through a link', () => {
    const edge = makeEdge({ symbol: './x.module.js', file: '/r/x/a.ts', to: '/real/x.module.ts' });
    expect(newSpecifier(edge, '/r/y/a.ts', '/real/x.module.ts')).toBe('../../real/x.module.js');
  });
});
