<script setup lang="ts">
  const { data } = await useFetch('/api/cart');
</script>

<template>
  <main>
    <AppCard
      v-for="item in data ?? []"
      :key="item.title"
      :title="item.title"
      :price="item.price"
    />
  </main>
</template>
