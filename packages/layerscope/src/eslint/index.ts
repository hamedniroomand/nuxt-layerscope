import type { ESLint, Linter } from 'eslint';

import { packageVersion } from '#src/version.ts';

import { createRecommended } from './recommended.ts';
import { rules } from './rules.ts';

const plugin: ESLint.Plugin & { configs: Record<string, Linter.Config> } = {
  meta: { name: 'nuxt-layerscope', version: packageVersion() },
  rules,
  configs: {},
};

plugin.configs.recommended = createRecommended(plugin);

export default plugin;
