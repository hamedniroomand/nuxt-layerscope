import { describe, expect, it } from 'vite-plus/test';

import { scanVue } from '#src/scan/vue.ts';

describe('scanVue', () => {
  it('finds components in PascalCase and kebab-case', () => {
    const scan = scanVue('<template><BaseButton /><login-form /><div /></template>', 'a.vue');
    expect(scan.components.map(ref => ref.name)).toEqual(['BaseButton', 'LoginForm']);
  });

  it('finds template identifiers that have no setup binding', () => {
    const source = `<script setup lang="ts">
const cart = useCart();
</script>
<template><p :title="formatPrice(1)">{{ cart.total }} {{ item }}</p>
<i v-for="row in rows" :key="row">{{ row }}</i></template>`;
    const scan = scanVue(source, 'a.vue');
    expect(scan.free.map(ref => ref.name)).toEqual(['useCart']);
    expect(scan.templateIdents.map(ref => ref.name)).toEqual(['formatPrice', 'item', 'rows']);
  });

  it('points template references at their source position', () => {
    const source = '<template>\n  <div>\n    <BaseButton />\n  </div>\n</template>';
    const [ref] = scanVue(source, 'a.vue').components;
    expect(source.slice(ref.offset, ref.offset + 11)).toBe('<BaseButton');
  });

  it('maps script offsets back into the file', () => {
    const source = '<template><div /></template>\n<script setup>\nuseCart();\n</script>';
    const [ref] = scanVue(source, 'a.vue').free;
    expect(source.slice(ref.offset, ref.offset + 7)).toBe('useCart');
  });

  it('resolves literal dynamic components and flags runtime ones', () => {
    const source = `<script setup>
import Imported from './Imported.vue';
const name = 'X';
</script>
<template><component is="Foo" /><component :is="Imported" /><component :is="name" /></template>`;
    const scan = scanVue(source, 'a.vue');
    expect(scan.components.map(ref => ref.name)).toEqual(['Foo']);
    expect(scan.dynamicComponents).toHaveLength(1);
  });

  it('shares scope between <script> and <script setup>', () => {
    const source = `<script>
const useLocal = () => 1;
</script>
<script setup>
useLocal();
</script>`;
    expect(scanVue(source, 'a.vue').free).toEqual([]);
  });
});
