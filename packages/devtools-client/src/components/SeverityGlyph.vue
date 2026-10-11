<script setup lang="ts">
  defineProps<{ severity: 'error' | 'warn' }>();
</script>

<template>
  <svg
    class="glyph"
    :class="severity === 'error' ? 'err' : 'warn'"
    viewBox="0 0 10 10"
    aria-hidden="true"
  >
    <circle
      v-if="severity === 'error'"
      cx="5"
      cy="5"
      r="4.5"
      fill="currentColor"
    />
    <path
      v-else
      d="M5 .5 9.7 9.5H.3z"
      fill="currentColor"
    />
  </svg>
</template>

<style scoped>
  .glyph {
    display: inline-block;
    width: 10px;
    height: 10px;
    flex: none;
    vertical-align: -1px;
  }
</style>
