<script setup lang="ts">
  const cart = useCart();
</script>

<template>
  <ul>
    <li
      v-for="line in cart.lines.value"
      :key="line.title"
    >
      {{ line.title }}: {{ formatPrice(line.price) }}
    </li>
  </ul>
  <p>Total: {{ formatPrice(cart.total.value) }}</p>
</template>
