<script setup lang="ts">
  import { withBase } from 'vitepress';

  import { icon } from '#theme/icons.ts';

  defineProps<{ to: string; title: string }>();

  const arrow = icon('arrow-right');
</script>

<template>
  <a
    class="ls-read-more"
    :href="withBase(to)"
  >
    <span class="ls-read-more-label">Read next</span>
    <span class="ls-read-more-title">{{ title }}</span>
    <span
      class="ls-read-more-arrow"
      v-html="arrow"
    />
  </a>
</template>
