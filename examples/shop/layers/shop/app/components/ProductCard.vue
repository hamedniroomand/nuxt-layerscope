<script setup lang="ts">
  defineProps<{ title: string; price: number }>();

  const cart = useCart();
</script>

<template>
  <article>
    <h2>{{ title }}</h2>
    <p>{{ formatPrice(price) }}</p>
    <BaseButton
      label="Add to cart"
      @click="cart.add(title, price)"
    />
  </article>
</template>
