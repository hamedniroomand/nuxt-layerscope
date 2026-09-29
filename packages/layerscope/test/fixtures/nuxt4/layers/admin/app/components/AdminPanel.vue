<script setup lang="ts">
const cart = useCart();
</script>

<template>
  <div>
    <LoginForm />
    <CartSummary variant="compact" />
    {{ cart.total }} {{ formatPrice(2) }}
  </div>
</template>
