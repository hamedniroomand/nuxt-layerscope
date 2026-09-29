import { localGit } from './local-git';

export default defineNuxtConfig({
  extends: [
    'fixture-npm-layer',
    ['git:./.remote-layer-repo', { giget: { providers: { git: localGit } } }],
  ],
  modules: ['@vueuse/nuxt', '../../../src/index.ts'],
  experimental: { componentIslands: true },
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2025-07-15',
});
