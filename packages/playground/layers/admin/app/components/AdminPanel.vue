<script setup lang="ts">
  const { orders } = useOrders();
  const cart = useCart();
  const csv = computed(() => exportCsv(orders.value));
</script>

<template>
  <section>
    <AppCard
      title="Open cart"
      :price="cart.total.value"
    />
    <pre>{{ csv }}</pre>
  </section>
</template>
