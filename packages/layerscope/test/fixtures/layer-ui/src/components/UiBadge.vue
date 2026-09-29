<script setup lang="ts">
const theme = useTheme();
</script>

<template>
  <span :data-mode="theme.mode"><slot /></span>
</template>
