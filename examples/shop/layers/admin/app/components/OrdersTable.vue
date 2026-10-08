<script setup lang="ts">
  const { orders } = useOrders();
</script>

<template>
  <table>
    <tr
      v-for="order in orders"
      :key="order.id"
    >
      <td>{{ order.user }}</td>
      <td>{{ formatPrice(order.total) }}</td>
    </tr>
  </table>
</template>
