<script setup lang="ts">
  import { onMounted, useTemplateRef } from 'vue';

  defineProps<{ message: string; action: string }>();
  const emit = defineEmits<{ confirm: []; cancel: [] }>();

  const button = useTemplateRef<HTMLButtonElement>('button');
  onMounted(() => button.value?.focus());
</script>

<template>
  <div
    class="confirm"
    role="alertdialog"
    :aria-label="message"
    @keydown.esc.stop="emit('cancel')"
  >
    <span>{{ message }}</span>
    <button
      ref="button"
      type="button"
      class="primary"
      @click="emit('confirm')"
    >
      {{ action }}
    </button>
    <button
      type="button"
      @click="emit('cancel')"
    >
      Cancel
    </button>
  </div>
</template>

<style scoped>
  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--tint-accent);
  }

  .primary {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
