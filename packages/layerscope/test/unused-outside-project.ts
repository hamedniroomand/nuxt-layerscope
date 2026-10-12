import { writeProject } from './unused-extra-project.ts';

/**
 * An app with a local layer `web` and a workspace layer `ui` that is outside the project root, in
 * a sibling dir (`../packages/ui`), as in a pnpm workspace.
 */
export const OUTSIDE_FILES = {
  'layers/web/app/composables/useLocalUsed.ts': 'export const useLocalUsed = () => 1;\n',
  'layers/web/app/composables/useLocalUnused.ts': 'export const useLocalUnused = () => 1;\n',
  'layers/web/app/pages/index.vue': `<script setup lang="ts">
useLocalUsed();
useUiUsed();
</script>
<template><div /></template>
`,
  '../packages/ui/app/composables/useUiUsed.ts': 'export const useUiUsed = () => 1;\n',
  '../packages/ui/app/composables/useUiUnused.ts': 'export const useUiUnused = () => 1;\n',
};

export const OUTSIDE_IMPORTS = {
  useLocalUsed: 'layers/web/app/composables/useLocalUsed.ts',
  useLocalUnused: 'layers/web/app/composables/useLocalUnused.ts',
  useUiUsed: '../packages/ui/app/composables/useUiUsed.ts',
  useUiUnused: '../packages/ui/app/composables/useUiUnused.ts',
};

export const OUTSIDE_CONFIG =
  "{ layers: { web: { path: 'layers/web', allow: [] }, ui: { path: '../packages/ui' } } }";

/** The project root is `<own dir>/app`, so `../packages/ui` is not shared with other projects. */
export function outsideProject(
  files: Record<string, string> = {},
  imports: Record<string, string> = {},
): string {
  return writeProject(
    { ...OUTSIDE_FILES, ...files },
    { ...OUTSIDE_IMPORTS, ...imports },
    OUTSIDE_CONFIG,
    {},
    true,
  );
}
