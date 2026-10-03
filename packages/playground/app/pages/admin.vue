<script setup lang="ts">
  // On purpose: the widget is chosen at runtime, so layerscope cannot know which component renders.
  // The Unused view shows a note about it.
  const widget = shallowRef(resolveComponent('AdminPanel'));
</script>

<template>
  <main>
    <component :is="widget" />
  </main>
</template>
