<script setup lang="ts">
  import { useBasket as basket } from '../../checkout/composables/useBasket';
  const b = basket();
</script>
<template>
  <UiCard><LazyBasketList />{{ b.items.value.length }}</UiCard>
</template>
