<script setup lang="ts">
  defineProps<{ count: number }>();
</script>

<!-- On purpose: no page or component uses this badge, so the Unused view lists it. -->
<template>
  <span class="app-badge">{{ count }}</span>
</template>
