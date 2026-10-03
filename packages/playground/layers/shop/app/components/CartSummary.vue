<script setup lang="ts">
  const cart = useCart();
</script>

<template>
  <AppCard
    v-for="line in cart.lines.value"
    :key="line.title"
    :title="line.title"
    :price="line.price"
  />
  <p>Total: {{ formatPrice(cart.total.value) }}</p>
</template>
