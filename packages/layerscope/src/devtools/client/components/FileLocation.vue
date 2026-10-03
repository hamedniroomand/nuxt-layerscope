<script setup lang="ts">
  import { useTab } from '#src/devtools/client/lib/context.ts';

  /** `file` is the path the editor opens; the slot is the text shown. */
  defineProps<{ file: string; line?: number; column?: number }>();

  const { api, demo } = useTab();
</script>

<!-- Opens the file in the editor; in a snapshot there is no editor, so it is plain text. Parents
     style it by the `file` class, which both elements have. -->
<template>
  <span
    v-if="demo"
    class="file mono"
  >
    <slot />
  </span>
  <a
    v-else
    class="file mono"
    href="#"
    @click.prevent.stop="api.openInEditor(file, line, column)"
  >
    <slot />
  </a>
</template>
