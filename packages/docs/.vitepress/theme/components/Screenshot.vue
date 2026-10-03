<script setup lang="ts">
  import { withBase } from 'vitepress';

  /** `name` is a capture in `public/devtools/`, such as `graph`; both themes are rendered. */
  defineProps<{ name: string; alt: string }>();
</script>

<template>
  <figure class="ls-shot">
    <img
      class="ls-shot-light"
      :src="withBase(`/devtools/${name}-light.png`)"
      :alt="alt"
      width="1200"
      height="720"
      loading="lazy"
      decoding="async"
    />
    <img
      class="ls-shot-dark"
      :src="withBase(`/devtools/${name}-dark.png`)"
      :alt="alt"
      width="1200"
      height="720"
      loading="lazy"
      decoding="async"
    />
  </figure>
</template>
