<script setup lang="ts">
  defineProps<{ label: string }>();
</script>

<template>
  <button
    type="button"
    class="app-button"
  >
    {{ label }}
  </button>
</template>
