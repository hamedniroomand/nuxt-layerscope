import type { Theme } from 'vitepress';
// The fontless entry: the theme loads Geist in config.ts, so the bundled Inter is not needed.
import DefaultTheme from 'vitepress/theme-without-fonts';
import type { VNode } from 'vue';
import { h } from 'vue';

import { registerComponents } from './components.ts';
import BrandPattern from './components/BrandPattern.vue';
import HomeHero from './components/HomeHero.vue';
import NotFound from './components/NotFound.vue';

import './style.css';

export default {
  extends: DefaultTheme,
  Layout(): VNode {
    return h(DefaultTheme.Layout, null, {
      // HomeHero shows the `intro` frontmatter of a home page. Do not also set `hero`, or the
      // default hero shows too.
      'home-hero-before': () => [h(BrandPattern), h(HomeHero)],
      'not-found': () => h(NotFound),
    });
  },
  enhanceApp({ app }): void {
    registerComponents(app);
  },
} satisfies Theme;
