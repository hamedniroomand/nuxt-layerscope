<script setup lang="ts">
  import { withBase } from 'vitepress';
  import { computed } from 'vue';

  import { icon as renderIcon } from '#theme/icons.ts';

  const props = defineProps<{ title?: string; icon?: string; to?: string }>();

  const glyph = computed(() => (props.icon === undefined ? '' : renderIcon(props.icon)));
  const arrow = renderIcon('arrow-right');
  const href = computed((): string | null => {
    if (props.to === undefined) {
      return null;
    }
    return /^https?:/u.test(props.to) ? props.to : withBase(props.to);
  });
</script>

<template>
  <component
    :is="href ? 'a' : 'div'"
    class="ls-card"
    :class="{ 'ls-card-link': href }"
    :href="href ?? undefined"
  >
    <span
      v-if="glyph"
      class="ls-card-glyph"
      v-html="glyph"
    />
    <p
      v-if="title"
      class="ls-card-title"
    >
      {{ title }}
    </p>
    <div class="ls-card-body">
      <slot />
    </div>
    <span
      v-if="href"
      class="ls-card-arrow"
      v-html="arrow"
    />
  </component>
</template>
