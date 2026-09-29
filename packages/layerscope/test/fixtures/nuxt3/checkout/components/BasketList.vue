<script setup lang="ts">
  const { items } = useBasket();
</script>
<template>
  <UiCard
    ><li
      v-for="item in items"
      :key="item"
    >
      {{ item }}
    </li></UiCard
  >
</template>
