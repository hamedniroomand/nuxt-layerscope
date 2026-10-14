import { describe, expect, it } from 'vite-plus/test';

import { scanFile } from '#src/scan/index.ts';
import { scanModule } from '#src/scan/script.ts';

function tags(code: string, file = 'widget.tsx'): string[] {
  return scanModule(code, file).jsxTags.map(tag => tag.name);
}

describe('component tags in JSX (#119)', () => {
  it('reads a PascalCase tag and a kebab-case tag, in PascalCase', () => {
    const code = 'export default () => <div><TsxOnly /><kebab-tsx /></div>;';
    expect(tags(code)).toEqual(['TsxOnly', 'KebabTsx']);
  });

  it('reads a tag in a .jsx file too', () => {
    expect(tags('export default () => <CartBadge />;', 'widget.jsx')).toEqual(['CartBadge']);
  });

  it('gives the offset of the tag name', () => {
    const code = 'export default () => <CartBadge />;';
    expect(scanModule(code, 'widget.tsx').jsxTags).toEqual([
      { name: 'CartBadge', offset: code.indexOf('CartBadge') },
    ]);
  });

  it('skips HTML and SVG elements, Fragment and a local binding', () => {
    const code = [
      "import { Fragment } from 'vue';",
      "import Imported from './Imported.vue';",
      'const Local = () => null;',
      'export default () => (',
      '  <Fragment><div /><svg><circle /></svg><Local /><Imported /></Fragment>',
      ');',
    ].join('\n');
    expect(tags(code)).toEqual([]);
  });

  it('skips Fragment with no import too, as the JSX plugin does', () => {
    expect(tags('export default () => <Fragment><span /></Fragment>;')).toEqual([]);
  });

  it('skips a JavaScript global, which the JSX plugin takes as a binding', () => {
    expect(tags('export default () => <div><Map /><Error /><Date /></div>;')).toEqual([]);
  });

  it('skips a member tag and a namespaced tag', () => {
    expect(tags('const Ui = { Card: 1 };\nexport default () => <Ui.Card />;')).toEqual([]);
    expect(tags('export default () => <svg:a />;')).toEqual([]);
  });

  it('reads a tag in <script lang="tsx"> of a .vue file', () => {
    const source =
      '<script setup lang="tsx">\nconst view = () => <CartBadge />;\n</script>\n<template><component :is="view" /></template>\n';
    expect(scanFile(source, '/app/card.vue').jsxTags.map(tag => tag.name)).toEqual(['CartBadge']);
  });
});
