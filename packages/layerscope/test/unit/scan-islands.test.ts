import { describe, expect, it } from 'vite-plus/test';

import { scanFile } from '#src/scan/index.ts';
import { scanModule } from '#src/scan/script.ts';

function template(body: string): string {
  return `<script setup lang="ts">\nconst n = 'IslandOnly';\n</script>\n<template>${body}</template>\n`;
}

describe('<NuxtIsland> in a template', () => {
  it('reads the static name as the island component, as written', () => {
    const source = template('<NuxtIsland name="IslandOnly" />');
    const scan = scanFile(source, '/app/page.vue');
    expect(scan.islands).toEqual([{ name: 'IslandOnly', offset: source.indexOf('<NuxtIsland') }]);
    expect(scan.quietDynamicComponents).toEqual([]);
  });

  it('reads the kebab-case tag too', () => {
    const scan = scanFile(template('<nuxt-island name="IslandOnly" />'), '/app/page.vue');
    expect(scan.islands.map(island => island.name)).toEqual(['IslandOnly']);
  });

  it('gives a quiet runtime use, not a finding, for a bound name', () => {
    const scan = scanFile(template('<NuxtIsland :name="n" />'), '/app/page.vue');
    expect(scan.islands).toEqual([]);
    expect(scan.quietDynamicComponents).toHaveLength(1);
    expect(scan.dynamicComponents).toEqual([]);
  });

  it('does not read the name of another element', () => {
    const scan = scanFile(template('<BaseInput name="IslandOnly" />'), '/app/page.vue');
    expect(scan.islands).toEqual([]);
  });
});

describe('<NuxtIsland> with v-bind', () => {
  it('gives a quiet runtime use for v-bind of an object, which can hold the name', () => {
    const scan = scanFile(template('<NuxtIsland v-bind="{ name: n }" />'), '/app/page.vue');
    expect(scan.islands).toEqual([]);
    expect(scan.quietDynamicComponents).toHaveLength(1);
  });

  it('keeps the static name and gives a quiet runtime use for v-bind of an object too', () => {
    const scan = scanFile(
      template('<NuxtIsland name="IslandOnly" v-bind="{ name: n }" />'),
      '/app/page.vue',
    );
    expect(scan.islands.map(island => island.name)).toEqual(['IslandOnly']);
    expect(scan.quietDynamicComponents).toHaveLength(1);
  });

  it('gives a quiet runtime use for v-bind with a dynamic argument', () => {
    const scan = scanFile(template('<NuxtIsland v-bind:[n]="n" />'), '/app/page.vue');
    expect(scan.islands).toEqual([]);
    expect(scan.quietDynamicComponents).toHaveLength(1);
  });

  it('gives no runtime use for v-bind of another static prop', () => {
    const scan = scanFile(
      template('<NuxtIsland name="IslandOnly" :lazy="true" />'),
      '/app/page.vue',
    );
    expect(scan.quietDynamicComponents).toEqual([]);
  });
});

describe('resolveDynamicComponent', () => {
  it('gives a quiet runtime use, not a finding, for a runtime value', () => {
    const scan = scanModule(
      "import { resolveDynamicComponent } from 'vue';\nexport const c = (n: string) => resolveDynamicComponent(n);",
      'file.ts',
    );
    expect(scan.quietDynamicComponents).toHaveLength(1);
    expect(scan.dynamicComponents).toEqual([]);
    expect(scan.components).toEqual([]);
  });

  it('gives nothing for a template literal without expressions, a fixed name too', () => {
    const scan = scanModule(
      "import { resolveDynamicComponent } from 'vue';\nexport const c = resolveDynamicComponent(`BaseButton`);",
      'file.ts',
    );
    expect(scan.components).toEqual([]);
    expect(scan.quietDynamicComponents).toEqual([]);
  });

  it('gives no component use for a fixed name, which Nuxt does not resolve', () => {
    const scan = scanModule(
      "import { resolveDynamicComponent } from 'vue';\nexport const c = resolveDynamicComponent('BaseButton');",
      'file.ts',
    );
    expect(scan.components).toEqual([]);
    expect(scan.quietDynamicComponents).toEqual([]);
  });
});
