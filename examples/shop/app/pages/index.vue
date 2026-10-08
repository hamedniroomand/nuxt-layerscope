<script setup lang="ts">
  const { data: products } = await useFetch('/api/products');
</script>

<template>
  <main>
    <ProductCard
      v-for="product in products"
      :key="product.id"
      :title="product.title"
      :price="product.price"
    />
    <CartSummary />
  </main>
</template>
