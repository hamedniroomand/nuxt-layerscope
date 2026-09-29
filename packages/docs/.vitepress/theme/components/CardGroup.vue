<script setup lang="ts">
  const props = defineProps<{ cols?: number | string }>();
</script>

<template>
  <div
    class="ls-card-group"
    :style="{ '--ls-cols': String(props.cols ?? 2) }"
  >
    <slot />
  </div>
</template>
