<script setup lang="ts">
  defineProps<{ label: string }>();
</script>

<!-- On purpose: this component has the same name as the one in `base` and replaces it. A
     shadowed-component warning. -->
<template>
  <button
    type="button"
    class="app-button app-button--rounded"
  >
    {{ label }}
  </button>
</template>
