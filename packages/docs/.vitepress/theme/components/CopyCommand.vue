<script setup lang="ts">
  import { ref } from 'vue';

  import { icon } from '#theme/icons.ts';

  const props = defineProps<{ command: string }>();

  const copied = ref(false);
  const copyIcon = icon('copy');
  const checkIcon = icon('check');
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(props.command);
    } catch {
      return;
    }
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
    }, 1600);
  }
</script>

<template>
  <div class="ls-command">
    <span
      class="ls-command-prompt"
      aria-hidden="true"
      >$</span
    >
    <code class="ls-command-text">{{ command }}</code>
    <button
      type="button"
      class="ls-command-copy"
      aria-label="Copy the command"
      @click="copy"
    >
      <span
        class="ls-command-icon"
        :class="{ 'is-copied': copied }"
        v-html="copied ? checkIcon : copyIcon"
      />
    </button>
    <span
      class="visually-hidden"
      aria-live="polite"
      >{{ copied ? 'Copied' : '' }}</span
    >
  </div>
</template>
