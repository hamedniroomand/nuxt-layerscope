import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import type { VNode } from 'vue';
import { h } from 'vue';

import BrandPattern from './components/BrandPattern.vue';
import Card from './components/Card.vue';
import CardGroup from './components/CardGroup.vue';
import HeroLogo from './components/HeroLogo.vue';
import Mermaid from './components/Mermaid.vue';
import ReadMore from './components/ReadMore.vue';
import Steps from './components/Steps.vue';

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
    app.component('Card', Card);
    app.component('CardGroup', CardGroup);
    app.component('Mermaid', Mermaid);
    app.component('ReadMore', ReadMore);
    app.component('Steps', Steps);
  },
} satisfies Theme;
