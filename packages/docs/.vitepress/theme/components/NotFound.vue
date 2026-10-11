<script setup lang="ts">
  import { withBase } from 'vitepress';

  import { icon } from '#theme/icons.ts';

  import HeroLogo from './HeroLogo.vue';

  const links = [
    { text: 'Getting started', link: '/guide/getting-started', glyph: icon('rocket') },
    { text: 'CLI reference', link: '/reference/cli', glyph: icon('terminal') },
    { text: 'Config reference', link: '/reference/config', glyph: icon('settings') },
    { text: 'Troubleshooting', link: '/guide/troubleshooting', glyph: icon('life-buoy') },
  ];
</script>

<template>
  <main class="ls-not-found">
    <HeroLogo />
    <p class="ls-not-found-code">404</p>
    <h1 class="ls-not-found-title">This page is not in the docs</h1>
    <p class="ls-not-found-text">
      The page may have moved, or the link may be wrong. Use the search, or start from one of these
      pages.
    </p>
    <nav
      class="ls-not-found-links"
      aria-label="Suggested pages"
    >
      <a
        v-for="item in links"
        :key="item.link"
        :href="withBase(item.link)"
      >
        <span v-html="item.glyph" />
        {{ item.text }}
      </a>
    </nav>
    <a
      class="ls-button ls-button-alt"
      :href="withBase('/')"
      >Go to the home page</a
    >
  </main>
</template>
