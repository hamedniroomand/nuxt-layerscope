import { defineConfig } from 'vitepress';

import { icon } from './icons.ts';

const REPOSITORY = 'https://github.com/hamedniroomand/nuxt-layerscope';
const SITE = 'https://layerscope.kitdev.space';
const BASE = '/';
const TITLE = 'layerscope';
const DESCRIPTION =
  'Layer boundary checks for Nuxt 3 and 4. layerscope resolves auto-imports, components and server utils the way Nuxt does, and fails CI when a layer uses one it is not allowed to.';

function link(name: string, text: string, path: string): { text: string; link: string } {
  return { text: icon(name) + text, link: path };
}

export default defineConfig({
  title: TITLE,
  titleTemplate: ':title · layerscope',
  description: DESCRIPTION,
  lang: 'en-US',
  base: BASE,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: SITE },

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#00dc82' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: TITLE }],
    ['meta', { property: 'og:title', content: 'layerscope · Layer boundaries for Nuxt' }],
    ['meta', { property: 'og:description', content: DESCRIPTION }],
    ['meta', { property: 'og:url', content: SITE }],
    ['meta', { property: 'og:image', content: `${SITE}og-image.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'layerscope: layer boundaries for Nuxt' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'layerscope · Layer boundaries for Nuxt' }],
    ['meta', { name: 'twitter:description', content: DESCRIPTION }],
    ['meta', { name: 'twitter:image', content: `${SITE}og-image.png` }],
    [
      'script',
      {
        defer: '',
        src: 'https://umami.niroomand.dev/script.js',
        'data-website-id': '70cf5b0a-7367-42aa-9855-302f736063ce',
        'data-domains': new URL(SITE).hostname,
      },
    ],
  ],

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    config(md) {
      const fence = md.renderer.rules.fence;
      if (fence === undefined) {
        return;
      }
      // VitePress strips `[title]` from a fence's info before rendering, so keep it at parse time.
      md.core.ruler.push('ls-fence-title', state => {
        for (const token of state.tokens) {
          const title = token.type === 'fence' ? /\[(.+?)\]/u.exec(token.info)?.[1] : undefined;
          if (title !== undefined) {
            token.meta = { ...(token.meta as object | null), title };
          }
        }
      });
      // A ```mermaid block becomes a diagram. A ```ts [nuxt.config.ts] block shows the file
      // name in the badge where VitePress would show the language.
      md.renderer.rules.fence = (tokens, index, options, env, self): string => {
        const token = tokens[index];
        if (token.info.trim() === 'mermaid') {
          return `<Mermaid code="${encodeURIComponent(token.content)}" />`;
        }
        const html = fence(tokens, index, options, env, self);
        const title = (token.meta as { title?: string } | null)?.title;
        return title === undefined
          ? html
          : html.replace(/<span class="lang">.*?<\/span>/u, `<span class="lang">${title}</span>`);
      };
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: TITLE,

    nav: [
      { text: 'Guide', link: '/guide/what-is-layerscope', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/cli', activeMatch: '/reference/' },
      { text: 'Contributing', link: '/contributing/development', activeMatch: '/contributing/' },
      {
        text: 'v0.1.4',
        items: [
          { text: 'Changelog', link: `${REPOSITORY}/blob/main/packages/layerscope/CHANGELOG.md` },
          { text: 'Releases', link: `${REPOSITORY}/releases` },
          { text: 'npm', link: 'https://www.npmjs.com/package/nuxt-layerscope' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            link('compass', 'What is layerscope?', '/guide/what-is-layerscope'),
            link('rocket', 'Getting started', '/guide/getting-started'),
          ],
        },
        {
          text: 'Essentials',
          items: [
            link('layers', 'Layers', '/guide/layers'),
            link('package', 'Nuxt module', '/guide/nuxt-module'),
            link('archive', 'Baseline', '/guide/baseline'),
            link('git-pull-request', 'Continuous integration', '/guide/ci'),
          ],
        },
        {
          text: 'Tools',
          items: [
            link('search', 'Explore dependencies', '/guide/explore'),
            link('code', 'Editor feedback', '/guide/editor'),
            link('app-window', 'DevTools', '/guide/devtools'),
          ],
        },
        {
          text: 'In depth',
          items: [
            link('workflow', 'How it works', '/guide/how-it-works'),
            link('life-buoy', 'Troubleshooting', '/guide/troubleshooting'),
            link('scale', 'Compared with other tools', '/guide/comparison'),
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            link('terminal', 'CLI', '/reference/cli'),
            link('settings', 'Config', '/reference/config'),
            link('shield-check', 'Rules', '/reference/rules'),
            link('file-json', 'Output formats', '/reference/output'),
            link('zap', 'GitHub Action', '/reference/github-action'),
            link('braces', 'JavaScript API', '/reference/api'),
            link('database', 'Registry file', '/reference/registry'),
          ],
        },
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            link('hammer', 'Development', '/contributing/development'),
            link('tag', 'Releasing', '/contributing/releasing'),
          ],
        },
      ],
    },

    outline: { level: [2, 3], label: 'On this page' },
    search: { provider: 'local' },
    socialLinks: [
      { icon: 'github', link: REPOSITORY },
      { icon: 'npm', link: 'https://www.npmjs.com/package/nuxt-layerscope' },
    ],
    editLink: {
      pattern: `${REPOSITORY}/edit/main/packages/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Hamed Niroomand',
    },
  },
});
