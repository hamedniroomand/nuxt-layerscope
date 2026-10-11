<script setup lang="ts">
  import { computed, ref } from 'vue';

  import { icon } from '#theme/icons.ts';

  const props = defineProps<{ command: string }>();

  // The clipboard API is not available on an insecure origin, and the browser can refuse it.
  // Then the live region tells the user to copy the command by hand.
  const status = ref<'idle' | 'copied' | 'failed'>('idle');
  const copyIcon = icon('copy');
  const checkIcon = icon('check');
  const message = computed(
    () =>
      ({ idle: '', copied: 'Copied', failed: 'Copy failed. Select the command and copy it.' })[
        status.value
      ],
  );
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(props.command);
      status.value = 'copied';
    } catch {
      status.value = 'failed';
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      status.value = 'idle';
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
        :class="{ 'is-copied': status === 'copied' }"
        v-html="status === 'copied' ? checkIcon : copyIcon"
      />
    </button>
    <span
      class="visually-hidden"
      aria-live="polite"
      >{{ message }}</span
    >
  </div>
</template>
