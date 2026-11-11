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
import './widgets.css';

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
  enhanceApp({ app, router }): void {
    registerComponents(app);
    if (typeof document === 'undefined') {
      return;
    }
    // A new page comes up from below, as a layer that moves into place. A change of the hash
    // on the same page does not start it.
    let last = location.pathname;
    router.onAfterRouteChange = (): void => {
      if (location.pathname === last || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      last = location.pathname;
      document.querySelector('.VPDoc .content-container, .VPHome')?.animate(
        [
          { opacity: 0, transform: 'translateY(14px) scale(0.992)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    };
  },
} satisfies Theme;
