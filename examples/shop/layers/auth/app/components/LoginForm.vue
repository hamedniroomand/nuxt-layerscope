<script setup lang="ts">
  const { signIn } = useUser();
  const name = ref('');
</script>

<template>
  <form @submit.prevent="signIn(name)">
    <input
      v-model="name"
      placeholder="Your name"
    />
    <BaseButton label="Sign in" />
  </form>
</template>
