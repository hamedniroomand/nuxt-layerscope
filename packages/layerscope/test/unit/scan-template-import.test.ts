import { describe, expect, it } from 'vite-plus/test';

import { scanFile } from '#src/scan/index.ts';

/** The offset of `text` in `source`; it must be in the source once. */
function at(source: string, text: string): number {
  expect(source.indexOf(text)).toBe(source.lastIndexOf(text));
  return source.indexOf(text);
}

describe('import() in a template', () => {
  it('reads a fixed path as an import, at the path in the template', () => {
    const source = `<template><div @click="() => import('./x')" /></template>`;
    const scan = scanFile(source, 'a.vue');
    expect(scan.unread).toEqual([]);
    expect(scan.imports.map(ref => [ref.specifier, ref.offset])).toEqual([
      ['./x', at(source, "'./x'")],
    ]);
  });

  it('reports a path that is not a fixed string, at the path in the template', () => {
    const source = '<template><div @click="() => import(`./x/${a}`)" /></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports).toEqual([]);
    expect(scan.unread.map(part => [part.symbol, part.message, part.offset])).toEqual([
      [
        'import()',
        'Could not read import(): the path is not a fixed string. The module that it loads is not checked.',
        at(source, '`./x/'),
      ],
    ]);
  });

  it('gives each import() the offset of its own path in the template', () => {
    const source =
      '<template><div @click="() => import(`./a/${a}`)" /><p @click="() => import(b)" /><i @click="() => import(\'./c\')" />{{ import(`./a/${d}`) }}</template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => [ref.specifier, ref.offset])).toEqual([
      ['./c', at(source, "'./c'")],
    ]);
    const first = source.indexOf('`./a/');
    expect(scan.unread.map(part => part.offset).toSorted((x, y) => x - y)).toEqual([
      first,
      at(source, 'b)'),
      source.indexOf('`./a/', first + 1),
    ]);
  });

  it('keeps each offset when Vue puts the child before the directive', () => {
    const source = '<template><div v-show="import(`./k/${y}`)">{{ import(a) }}</div></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.unread.map(part => part.offset)).toEqual([at(source, 'a)'), at(source, '`./k/')]);
  });
});

describe('a comment between import and the path in a template', () => {
  it('gives each import() with a comment before the path its own offset', () => {
    const source =
      '<template><div @click="() => import /* a */ (`./a/${x}`)" /><p @click="() => import /* b */ (`./b/${y}`)" /></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.unread.map(part => part.offset)).toEqual([
      at(source, '`./a/'),
      at(source, '`./b/'),
    ]);
  });

  it('reads many comment pieces after import in linear time', () => {
    // The text is in a string, so the render code parses, and the import() makes the regex run.
    const source = `<template><p>{{ import(a) }}</p><p>{{ 'import /*${'*//*'.repeat(5000)}' }}</p></template>`;
    const started = performance.now();
    const scan = scanFile(source, 'a.vue');
    expect(performance.now() - started).toBeLessThan(1000);
    expect(scan.unread.map(part => [part.symbol, part.offset])).toEqual([
      ['import()', at(source, 'a)')],
    ]);
  });
});

describe('the position of import() in a template', () => {
  it('gives a real import() its own offset when a string before it has the same text', () => {
    const source = `<template><p>{{ "import('./a')" }}</p><p>{{ import('./a') }}</p></template>`;
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => ref.offset)).toEqual([source.lastIndexOf("'./a'")]);
  });

  it('gives two paths that are names their own offsets', () => {
    const source = '<template><div v-show="import(a)">{{ import(b) }}</div></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.unread.map(part => part.offset)).toEqual([at(source, 'b)'), at(source, 'a)')]);
  });

  it('gives a path on its own line its offset', () => {
    const source = "<template><p>{{\n  import(\n    './m'\n  )\n}}</p></template>";
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => ref.offset)).toEqual([at(source, "'./m'")]);
  });

  it('gives a path in an HTML character reference the offset of the reference', () => {
    const source = '<template><div :x="import(&quot;./c&quot;)" /></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => [ref.specifier, ref.offset])).toEqual([
      ['./c', at(source, '&quot;./c')],
    ]);
  });
});

describe('import() after an HTML character reference in a template', () => {
  it.each([
    ['a plain tag', '<template>'],
    ['a tag with attributes', '<template lang="html" class="x">'],
    ['CRLF line ends', '<template>\r\n'],
    ['a BOM', '﻿<template>'],
  ])('gives the > of <template> with %s', (_name, head) => {
    const source = `${head}<p :x="b &amp;&amp; import('./a')" /></template>`;
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => source.charAt(ref.offset))).toEqual(['>']);
  });

  it('does not give the offset of a string that the moved mappings point at', () => {
    const source =
      "<template><div :x=\"`&amp;&amp;&amp;&amp;&amp;&amp;b + import('./a')   ` + b + import('./a')\" /></template>";
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => source.charAt(ref.offset))).toEqual(['>']);
  });

  it('gives the path its offset when the reference is in another expression', () => {
    const source = `<template><p :y="a &amp;&amp; b" /><p :x="import('./a')" /></template>`;
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => ref.offset)).toEqual([at(source, "'./a'")]);
  });
});

describe('import() in a v-bind object', () => {
  it('does not take the offset from text after the element that copies the render code', () => {
    const source =
      '<template><div><p v-bind="{ s: `{{`, y: import(\'./x\'), z: a }" />"p", _normalizeProps(_guardReactiveProps({ s: `{{`, y: import(\'./x\')` }}</div></template>';
    const scan = scanFile(source, 'a.vue');
    const real = source.indexOf("'./x'");
    expect(scan.imports.map(ref => ref.offset)).not.toContain(source.lastIndexOf("'./x'"));
    expect(scan.imports.map(ref => source.charAt(ref.offset))).toEqual([source.charAt(real)]);
    expect(scan.imports.map(ref => ref.offset)).toEqual([real]);
  });
});
