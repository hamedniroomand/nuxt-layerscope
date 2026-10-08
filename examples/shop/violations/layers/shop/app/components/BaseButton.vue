<!-- Violation 6, shadowed component: this replaces `BaseButton` from `shared`. -->
<script setup lang="ts">
  defineProps<{ label: string }>();
</script>

<template>
  <button
    type="button"
    class="shop-button"
  >
    {{ label }}
  </button>
</template>
