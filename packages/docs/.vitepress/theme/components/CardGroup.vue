<script setup lang="ts">
  /**
   * `grid` puts the cards in equal columns. `bento` and `tiles` are for the home page. In both, a
   * `wide` card takes two columns. `tiles` joins the cards with hairlines.
   */
  const props = defineProps<{ cols?: number | string; variant?: 'grid' | 'bento' | 'tiles' }>();
</script>

<template>
  <div
    class="ls-card-group"
    :class="`ls-card-group-${props.variant ?? 'grid'}`"
    :style="{ '--ls-cols': String(props.cols ?? 2) }"
  >
    <slot />
  </div>
</template>
