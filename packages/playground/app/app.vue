<template>
  <nav>
    <NuxtLink to="/">Products</NuxtLink>
    <NuxtLink to="/cart">Cart</NuxtLink>
    <NuxtLink to="/admin">Admin</NuxtLink>
    <AppButton
      label="Theme"
      @click="useTheme().toggle()"
    />
  </nav>
  <NuxtPage />
</template>
