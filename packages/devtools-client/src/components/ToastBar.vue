<script setup lang="ts">
  defineProps<{ message: string | null }>();
  defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div
    class="live-region sr-only"
    aria-live="polite"
  >
    {{ message ?? '' }}
  </div>
  <div
    v-if="message"
    class="toast"
  >
    <span>{{ message }}</span>
    <span class="spacer" />
    <slot />
    <button
      type="button"
      aria-label="Dismiss"
      @click="$emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    padding: 0 14px;
    border-top: 1px solid var(--line);
    background: var(--bg-raised);
  }

  .spacer {
    flex: 1;
  }

  @media (prefers-reduced-motion: no-preference) {
    .toast {
      animation: slide 120ms ease-out;
    }
  }

  @keyframes slide {
    from {
      transform: translateY(100%);
    }
  }
</style>
