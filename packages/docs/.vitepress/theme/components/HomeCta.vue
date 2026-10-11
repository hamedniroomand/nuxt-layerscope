<script setup lang="ts">
  import { withBase } from 'vitepress';

  import { icon } from '#theme/icons.ts';

  import CopyCommand from './CopyCommand.vue';
  import HeroLogo from './HeroLogo.vue';

  defineProps<{ title: string; command: string; to: string; action: string }>();

  const arrow = icon('arrow-right');
</script>

<template>
  <div class="ls-cta">
    <HeroLogo />
    <div class="ls-cta-body">
      <p class="ls-cta-title">{{ title }}</p>
      <div class="ls-hero-actions">
        <a
          class="ls-button ls-button-brand"
          :href="withBase(to)"
        >
          {{ action }}
          <span
            class="ls-button-icon"
            v-html="arrow"
          />
        </a>
        <CopyCommand :command="command" />
      </div>
    </div>
  </div>
</template>
