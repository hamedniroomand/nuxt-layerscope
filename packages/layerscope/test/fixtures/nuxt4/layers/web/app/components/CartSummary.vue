<script setup lang="ts">
const props = defineProps<{ variant: string }>();
const cart = useCart();
</script>

<template>
  <div>
    {{ cart.total }}
    <base-button />
    <component :is="props.variant" />
  </div>
</template>
