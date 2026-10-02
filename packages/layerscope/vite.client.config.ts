import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';

// Absolute, so the build works from any working directory (the tests run from the repo root).
const root = fileURLToPath(new URL('src/devtools/client/', import.meta.url));

/** The DevTools tab client: Vue runtime-only, one JS entry and one CSS file in `dist/devtools`. */
export default defineConfig({
  root,
  base: './',
  plugins: [vue()],
  define: {
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    outDir: fileURLToPath(new URL('dist/devtools/', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: {
      input: `${root}main.ts`,
      output: {
        entryFileNames: 'client.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: 'client[extname]',
      },
    },
  },
});
