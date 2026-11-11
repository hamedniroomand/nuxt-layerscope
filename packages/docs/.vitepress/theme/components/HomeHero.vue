<script setup lang="ts">
  import { useData, withBase } from 'vitepress';
  import { computed } from 'vue';

  import { icon } from '#theme/icons.ts';

  import CopyCommand from './CopyCommand.vue';
  import ScopeLens from './ScopeLens.vue';

  interface Intro {
    title: string;
    tagline: string;
    command: string;
    action: { text: string; link: string };
  }

  // The hero text is in the `intro` frontmatter of index.md, so the copy stays with the page.
  const { frontmatter } = useData();
  const intro = computed(() => frontmatter.value.intro as Intro | undefined);
  const arrow = icon('arrow-right');
</script>

<template>
  <section
    v-if="intro"
    class="ls-hero"
  >
    <div class="ls-hero-copy">
      <h1 class="ls-hero-title">{{ intro.title }}</h1>
      <p class="ls-hero-tagline">{{ intro.tagline }}</p>
      <div class="ls-hero-actions">
        <a
          class="ls-button ls-button-brand"
          :href="withBase(intro.action.link)"
        >
          {{ intro.action.text }}
          <span
            class="ls-button-icon"
            v-html="arrow"
          />
        </a>
        <CopyCommand :command="intro.command" />
      </div>
    </div>

    <ScopeLens class="ls-hero-shot" />
  </section>
</template>
