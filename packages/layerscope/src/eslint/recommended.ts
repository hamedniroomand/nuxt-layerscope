import type { ESLint, Linter } from 'eslint';

import { projectStamp } from './stamp.ts';

/** Built when `eslint.config.*` loads, so `--cache` sees the stamp of this run. */
export function createRecommended(plugin: ESLint.Plugin, cwd?: string): Linter.Config {
  return {
    name: 'nuxt-layerscope/recommended',
    plugins: { layerscope: plugin },
    settings: { layerscope: { stamp: projectStamp(cwd) } },
    rules: {
      'layerscope/layer-boundary': 'error',
      'layerscope/layer-internal': 'error',
      'layerscope/unresolved-reference': 'warn',
    },
  };
}
