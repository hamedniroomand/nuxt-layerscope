<script setup lang="ts">
  import { useData, withBase } from 'vitepress';
  import { computed } from 'vue';

  import { icon } from '#theme/icons.ts';

  import CopyCommand from './CopyCommand.vue';

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

    <figure class="ls-hero-shot">
      <div class="ls-hero-frame">
        <!-- This image is the largest paint of the page, so it does not load lazily. -->
        <img
          class="ls-shot-light"
          :src="withBase('/devtools/hero-light.webp')"
          alt="The Graph view of the Layerscope DevTools tab: five layers from root to base, three violations that run back from right to left, and the ui to shop edge selected with useCart in the side panel."
          width="1600"
          height="611"
        />
        <img
          class="ls-shot-dark"
          :src="withBase('/devtools/hero-dark.webp')"
          alt="The Graph view of the Layerscope DevTools tab: five layers from root to base, three violations that run back from right to left, and the ui to shop edge selected with useCart in the side panel."
          width="1600"
          height="611"
        />
      </div>
    </figure>
  </section>
</template>
