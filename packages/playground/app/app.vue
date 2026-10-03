<template>
  <nav>
    <NuxtLink to="/">Products</NuxtLink>
    <NuxtLink to="/cart">Cart</NuxtLink>
    <NuxtLink to="/admin">Admin</NuxtLink>
    <!-- A plain link: the tab is not a page of this app. -->
    <a href="/__layerscope/">Open the Layerscope tab</a>
    <AppButton
      label="Theme"
      @click="useTheme().toggle()"
    />
  </nav>
  <NuxtPage />
</template>
