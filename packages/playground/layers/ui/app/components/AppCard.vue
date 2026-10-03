<script setup lang="ts">
  defineProps<{ title: string; price: number }>();

  // On purpose: `ui` may use only `base`, and `useCart` comes from `shop`. A layer-boundary error.
  const cart = useCart();
</script>

<template>
  <article class="app-card">
    <h2>{{ title }}</h2>
    <p>{{ formatPrice(price) }}</p>
    <AppButton
      label="Add to cart"
      @click="cart.add(title, price)"
    />
  </article>
</template>
