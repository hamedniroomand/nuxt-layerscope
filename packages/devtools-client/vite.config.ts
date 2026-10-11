import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';

/** A file of the core package, for the two contract aliases. */
function core(path: string): string {
  return fileURLToPath(new URL(`../layerscope/${path}`, import.meta.url));
}

/** The DevTools tab client: Vue runtime-only, one JS entry and one CSS file in `dist`. */
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('./', import.meta.url)),
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '#contract-testing': core('test/contract-testing.ts'),
      '#contract': core('src/devtools/contract.ts'),
    },
  },
  // Only for the build, so the tests keep the Vue development checks.
  define:
    command === 'build'
      ? {
          // Fixed, so a build from the tests (NODE_ENV=test) measures the bundle that ships.
          'process.env.NODE_ENV': JSON.stringify('production'),
          __VUE_OPTIONS_API__: 'false',
          __VUE_PROD_DEVTOOLS__: 'false',
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
        }
      : {},
  build: {
    outDir: fileURLToPath(new URL('dist/', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL('src/main.ts', import.meta.url)),
      output: {
        entryFileNames: 'client.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: 'client[extname]',
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
}));
