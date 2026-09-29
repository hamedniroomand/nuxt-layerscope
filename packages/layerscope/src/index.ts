import { layerscopeModule } from './module/index.ts';

// Nuxt loads a module by its default export, so `modules: ['nuxt-layerscope']` and
// `nuxi module add nuxt-layerscope` both work. The analysis API is in `nuxt-layerscope/api`,
// which keeps its parser and compiler out of Nuxt's startup.
export default layerscopeModule;
export type { ModuleOptions } from './module/index.ts';
export { defineConfig } from './config/define.ts';
export type * from './types.ts';
