<script setup lang="ts">
const { x } = useMouse();
const price = usePrice(250);
const flag = useRemoteFlag('sale');
</script>

<template>
  <BaseCard>
    <FlatThing />
    <WChart />
    <Clock />
    <NpmBadge />
    <NuxtIsland name="Weather" />
    {{ formatMoney(price) }} {{ x }} {{ flag }}
  </BaseCard>
</template>
