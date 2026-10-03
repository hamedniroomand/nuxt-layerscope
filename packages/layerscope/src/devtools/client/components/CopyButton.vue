<script setup lang="ts">
  import { nextTick, ref, useTemplateRef } from 'vue';

  import { copyText } from '#src/devtools/client/lib/clipboard.ts';

  const props = defineProps<{ text: string; label?: string }>();

  const state = ref<'idle' | 'copied' | 'manual'>('idle');
  const field = useTemplateRef<HTMLInputElement>('field');

  const copy = async (): Promise<void> => {
    if (await copyText(props.text)) {
      state.value = 'copied';
      return;
    }
    // The frame may not use the clipboard: show the text selected for a manual copy.
    state.value = 'manual';
    await nextTick();
    field.value?.select();
  };
</script>

<template>
  <span class="copy">
    <button
      type="button"
      @click="copy"
    >
      {{ state === 'copied' ? 'Copied' : (label ?? 'Copy') }}
    </button>
    <input
      v-if="state === 'manual'"
      ref="field"
      class="mono"
      readonly
      :value="text"
      aria-label="Text to copy"
      @blur="state = 'idle'"
    />
  </span>
</template>

<style scoped>
  .copy {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  input {
    min-width: 16ch;
  }
</style>
