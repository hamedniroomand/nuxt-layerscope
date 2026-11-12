import { describe, expect, it } from 'vite-plus/test';

import { scanFile } from '#src/scan/index.ts';

function page(script: string): string {
  return `<script setup lang="ts">\n${script}\n</script>\n<template><div /></template>\n`;
}

function names(source: string, file = '/app/pages/a.vue'): Record<string, string[]> {
  const scan = scanFile(source, file);
  return {
    layouts: scan.layouts.map(entry => entry.name),
    middleware: scan.middleware.map(entry => entry.name),
  };
}

describe('the names in definePageMeta', () => {
  it('reads a fixed layout name at the offset of its string', () => {
    const source = page("definePageMeta({ layout: 'shop' });");
    expect(scanFile(source, '/app/pages/a.vue').layouts).toEqual([
      { name: 'shop', offset: source.indexOf("'shop'") },
    ]);
  });

  it('reads one middleware name, or each name of a list, and skips a function', () => {
    expect(names(page("definePageMeta({ middleware: 'auth' });"))).toEqual({
      layouts: [],
      middleware: ['auth'],
    });
    const list = "definePageMeta({ middleware: ['auth', () => {}, 'shop-only', ...extra] });";
    expect(names(page(`const extra = [];\n${list}`))).toEqual({
      layouts: [],
      middleware: ['auth', 'shop-only'],
    });
  });

  it('reads the name of the layout object that Nuxt 4.5 and later accept', () => {
    const source = page("definePageMeta({ layout: { name: 'shop', props: { wide: true } } });");
    expect(names(source)).toEqual({ layouts: ['shop'], middleware: [] });
  });

  it('reads a name in parentheses, with a TypeScript wrapper, in backticks or under a quoted key', () => {
    const source = page(
      "definePageMeta({ 'layout': ('shop' as const), middleware: [`auth` satisfies string] });",
    );
    expect(names(source)).toEqual({ layouts: ['shop'], middleware: ['auth'] });
  });
});

describe('the values in definePageMeta that name nothing', () => {
  it('gives no name for a value that is not a fixed string', () => {
    const source = page(
      [
        "const name = 'shop';",
        'definePageMeta({ layout: false });',
        'definePageMeta({ layout: ref(name), middleware: [name, `${name}-x`] });',
        'definePageMeta({ layout: { name } });',
        "definePageMeta({ ['layout']: 'shop', middleware() { return 'auth'; } });",
        'definePageMeta({ get layout() { return name; } });',
      ].join('\n'),
    );
    expect(names(source)).toEqual({ layouts: [], middleware: [] });
  });

  it('does not read the other keys', () => {
    const source = page("definePageMeta({ name: 'shop', path: '/shop', alias: 'auth' });");
    expect(names(source)).toEqual({ layouts: [], middleware: [] });
  });

  it('reads definePageMeta in a script file', () => {
    expect(names("definePageMeta({ layout: 'shop' });", '/app/pages/a.tsx')).toEqual({
      layouts: ['shop'],
      middleware: [],
    });
  });
});

describe('the name in setPageLayout', () => {
  it('reads a fixed first argument as a layout name', () => {
    const source = "export default () => setPageLayout('wide');";
    expect(scanFile(source, '/app/middleware/a.ts').layouts).toEqual([
      { name: 'wide', offset: source.indexOf("'wide'") },
    ]);
  });

  it.each(['#imports', '#app', 'nuxt/app'])('reads it when it is imported from %s', from => {
    const source = `import { setPageLayout } from '${from}';\nsetPageLayout('wide');`;
    expect(names(source, '/app/middleware/a.ts').layouts).toEqual(['wide']);
  });

  it('skips a local function or an import from another module with that name', () => {
    const local = "function setPageLayout(name: string) {}\nsetPageLayout('wide');";
    const imported = "import { setPageLayout } from './layout';\nsetPageLayout('wide');";
    expect(names(local, '/app/utils/a.ts').layouts).toEqual([]);
    expect(names(imported, '/app/utils/a.ts').layouts).toEqual([]);
  });

  it('does not read a call in a template', () => {
    const source = `<template><button @click="setPageLayout('wide')" /></template>\n`;
    expect(names(source).layouts).toEqual([]);
  });

  it('gives no name for false or a runtime value', () => {
    const source = "const name = 'wide';\nsetPageLayout(false);\nsetPageLayout(name);";
    expect(names(source, '/app/utils/a.ts').layouts).toEqual([]);
  });
});
