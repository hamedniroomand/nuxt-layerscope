<script setup lang="ts">
  const { user } = useAuth();
</script>
<template>
  <form>
    <BaseButton>Login {{ user }}</BaseButton>
  </form>
</template>
