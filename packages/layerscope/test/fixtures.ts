import { fileURLToPath } from 'node:url';

export const NUXT3_ROOT = fileURLToPath(new URL('fixtures/nuxt3', import.meta.url));
export const NUXT4_ROOT = fileURLToPath(new URL('fixtures/nuxt4', import.meta.url));
export const MATRIX_ROOT = fileURLToPath(new URL('fixtures/matrix', import.meta.url));
export const CONFIGS_DIR = fileURLToPath(new URL('configs', import.meta.url));
export const SNAPSHOTS_DIR = fileURLToPath(new URL('snapshots', import.meta.url));
export const LAYER_UI_ROOT = fileURLToPath(new URL('fixtures/layer-ui', import.meta.url));
export const PLAYGROUND_ROOT = fileURLToPath(new URL('../../playground', import.meta.url));
