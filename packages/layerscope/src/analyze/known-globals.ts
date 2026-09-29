import globals from 'globals';

const SFC_MACROS = [
  'defineProps',
  'defineEmits',
  'defineExpose',
  'defineOptions',
  'defineSlots',
  'defineModel',
  'withDefaults',
];

/** Registered globally by Vue and vue-router, so never listed in components.d.ts. */
const GLOBAL_COMPONENTS = ['RouterLink', 'RouterView'];

export function knownIdentifiers(extra: string[]): Set<string> {
  return new Set([
    ...Object.keys(globals.builtin),
    ...Object.keys(globals.browser),
    ...Object.keys(globals.node),
    ...SFC_MACROS,
    'undefined',
    'arguments',
    ...extra,
  ]);
}

export function knownComponents(extra: string[]): Set<string> {
  return new Set([...GLOBAL_COMPONENTS, ...extra]);
}
