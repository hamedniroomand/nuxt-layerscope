import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    entry: {
      index: 'src/index.ts',
      bin: 'src/bin.ts',
      define: 'src/config/define.ts',
      api: 'src/api.ts',
      eslint: 'src/eslint/index.ts',
    },
    dts: true,
    format: ['esm'],
    platform: 'node',
    // The DevTools tab client. The `build` script runs `@layerscope/devtools-client#bundle` before
    // `vp pack`. `vp pack` alone copies nothing when the client dist is missing.
    copy: [{ from: '../devtools-client/dist/*', to: 'dist/devtools' }],
  },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/setup/prepare-fixtures.ts'],
    setupFiles: ['test/setup/clear-git-env.ts'],
    testTimeout: 60_000,
    // CI sets FORCE_COLOR; tests compare plain output.
    env: { FORCE_COLOR: '0' },
  },
});
