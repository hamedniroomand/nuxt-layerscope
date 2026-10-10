import { describe, expect, it } from 'vite-plus/test';

import { elementOnlyProps } from '#src/scan/element-props.ts';
import { scanFile } from '#src/scan/index.ts';
import type { FileScan } from '#src/scan/types.ts';

/** A single-file component whose template has one `<component :is>` element. */
function sfc(script: string, bound: string): string {
  return `<script setup lang="ts">\n${script}\n</script>\n<template><component :is="${bound}">a</component></template>\n`;
}

function scanOf(script: string, bound: string): FileScan {
  return scanFile(sfc(script, bound), '/app/card.vue');
}

// The analysis is per file, so each case is a single-file component.
// eslint-disable-next-line max-lines-per-function -- one table of cases
describe('<component :is> with a native element name', () => {
  it('gives no warning and no component for a string literal that is an element', () => {
    const scan = scanOf('const ok = true;', "'span'");
    expect(scan.dynamicComponents).toEqual([]);
    expect(scan.components).toEqual([]);
  });

  it('gives no warning for a ternary whose values are all elements', () => {
    const scan = scanOf('const ok = true;', "ok ? 'a' : 'button'");
    expect(scan.dynamicComponents).toEqual([]);
  });

  it('keeps a string literal that is not an element as a component reference', () => {
    const scan = scanOf('const ok = true;', "'MyCard'");
    expect(scan.dynamicComponents).toEqual([]);
    expect(scan.components.map(component => component.name)).toEqual(['MyCard']);
  });

  it('gives no warning for a prop typed as a union of element names, from an inline type', () => {
    const scan = scanOf("defineProps<{ tag?: 'h1' | 'h2' | 'p' }>();", 'tag');
    expect(scan.dynamicComponents).toEqual([]);
  });

  it('gives no warning for a prop typed by a named union of element names', () => {
    const script = "type Tag = 'h1' | 'p';\ndefineProps<{ tag?: Tag }>();";
    expect(scanOf(script, 'tag').dynamicComponents).toEqual([]);
  });

  it('keeps the warning for a type alias that loops, without an error', () => {
    const script = 'type A = B;\ntype B = A;\ndefineProps<{ tag?: A }>();';
    expect(scanOf(script, 'tag').dynamicComponents).toHaveLength(1);
  });

  it('gives no warning for a prop typed by an interface of the same file', () => {
    const script = "interface Props { tag?: 'h1' | 'p' }\ndefineProps<Props>();";
    expect(scanOf(script, 'tag').dynamicComponents).toEqual([]);
  });

  it('gives no warning for a string prop whose withDefaults default is an element', () => {
    const script = "withDefaults(defineProps<{ tag?: string }>(), { tag: 'span' });";
    const scan = scanOf(script, 'tag');
    expect(scan.dynamicComponents).toEqual([]);
    expect(scan.quietDynamicComponents).toHaveLength(1);
  });

  it('gives no warning for a string prop whose destructured default is an element', () => {
    const script = "const { tag = 'span' } = defineProps<{ tag?: string }>();";
    const scan = scanOf(script, 'tag');
    expect(scan.dynamicComponents).toEqual([]);
    expect(scan.quietDynamicComponents).toHaveLength(1);
  });

  it('keeps the warning for a string prop with no default', () => {
    const scan = scanOf('defineProps<{ tag?: string }>();', 'tag');
    expect(scan.dynamicComponents).toHaveLength(1);
  });

  it('keeps the warning for a string prop whose default is not an element', () => {
    const script = "withDefaults(defineProps<{ tag?: string }>(), { tag: 'MyCard' });";
    expect(scanOf(script, 'tag').dynamicComponents).toHaveLength(1);
  });

  it('keeps the warning for a props type that is imported', () => {
    const scan = scanOf("import type { Props } from './types';\ndefineProps<Props>();", 'tag');
    expect(scan.dynamicComponents).toHaveLength(1);
  });

  it('keeps the warning for a runtime value that is not a prop', () => {
    const scan = scanOf(
      "import { computed } from 'vue';\nconst current = computed(() => 'span');",
      'current',
    );
    expect(scan.dynamicComponents).toHaveLength(1);
  });
});

describe('<component :is> on a prop read through a variable', () => {
  it('gives no warning for a literal union read as props.tag', () => {
    const script = "const props = defineProps<{ tag?: 'h1' | 'p' }>();";
    expect(scanOf(script, 'props.tag').dynamicComponents).toEqual([]);
  });

  it('keeps a string prop with an element default quiet, read as props.tag', () => {
    const script = "const props = withDefaults(defineProps<{ tag?: string }>(), { tag: 'span' });";
    const scan = scanOf(script, 'props.tag');
    expect(scan.dynamicComponents).toEqual([]);
    expect(scan.quietDynamicComponents).toHaveLength(1);
  });

  it('works under any variable name', () => {
    const script = "const p = defineProps<{ tag?: 'h1' | 'p' }>();";
    expect(scanOf(script, 'p.tag').dynamicComponents).toEqual([]);
  });

  it('keeps the warning for a prop that is not element-only', () => {
    const script = "const props = defineProps<{ tag?: 'h1' | 'p'; other?: string }>();";
    expect(scanOf(script, 'props.other').dynamicComponents).toHaveLength(1);
  });
});

describe('elementOnlyProps', () => {
  it('reads the element-only props of a script', () => {
    const props = elementOnlyProps(
      "defineProps<{ a?: 'h1' | 'p'; b?: string; c?: 'MyCard' }>();\nwithDefaults(defineProps<{ d?: string }>(), { d: 'span' });",
      'ts',
    );
    expect([...props.kinds.entries()].toSorted(([a], [b]) => a.localeCompare(b))).toEqual([
      ['a', 'names'],
      ['d', 'default'],
    ]);
  });

  it('reads nothing from a script that does not parse', () => {
    expect(elementOnlyProps('defineProps<{ a?: ', 'ts').kinds.size).toBe(0);
  });
});
