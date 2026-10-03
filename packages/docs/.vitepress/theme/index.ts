import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import type { VNode } from 'vue';
import { h } from 'vue';

import { registerComponents } from './components.ts';
import BrandPattern from './components/BrandPattern.vue';
import HeroLogo from './components/HeroLogo.vue';

import './style.css';

export default {
  extends: DefaultTheme,
  Layout(): VNode {
    return h(DefaultTheme.Layout, null, {
      'home-hero-before': () => h(BrandPattern),
      'home-hero-image': () => h(HeroLogo),
    });
  },
  enhanceApp({ app }): void {
    registerComponents(app);
  },
} satisfies Theme;
