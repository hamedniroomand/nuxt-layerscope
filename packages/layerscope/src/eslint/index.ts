import type { ESLint, Linter } from 'eslint';

import { packageVersion } from '#src/version.ts';

import { rules } from './rules.ts';

const plugin: ESLint.Plugin & { configs: Record<string, Linter.Config> } = {
  meta: { name: 'nuxt-layerscope', version: packageVersion() },
  rules,
  configs: {},
};

plugin.configs.recommended = {
  name: 'nuxt-layerscope/recommended',
  plugins: { layerscope: plugin },
  rules: {
    'layerscope/layer-boundary': 'error',
    'layerscope/unresolved-reference': 'warn',
  },
};

export default plugin;
