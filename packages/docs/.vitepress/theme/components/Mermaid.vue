<script setup lang="ts">
  import { useData } from 'vitepress';
  import { onMounted, ref, watch } from 'vue';

  const props = defineProps<{ code: string }>();

  const { isDark } = useData();
  const host = ref<HTMLElement>();
  const id = `ls-mermaid-${Math.random().toString(36).slice(2)}`;

  function token(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Mermaid is large and browser-only, so it loads with the first diagram and redraws when the
  // color scheme changes. It gets the page font and colors so labels measure and render alike.
  async function draw(): Promise<void> {
    if (host.value === undefined) {
      return;
    }
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: token('--vp-font-family-base'),
      themeVariables: {
        darkMode: isDark.value,
        fontFamily: token('--vp-font-family-base'),
        fontSize: '14px',
        background: token('--vp-c-bg'),
        primaryColor: token('--vp-c-bg-soft'),
        primaryTextColor: token('--vp-c-text-1'),
        primaryBorderColor: token('--vp-c-brand-1'),
        secondaryColor: token('--vp-c-bg-elv'),
        tertiaryColor: token('--vp-c-bg-alt'),
        lineColor: token('--vp-c-text-3'),
        textColor: token('--vp-c-text-1'),
        nodeBorder: token('--vp-c-brand-1'),
        clusterBkg: token('--vp-c-bg-alt'),
        clusterBorder: token('--vp-c-divider'),
        edgeLabelBackground: token('--vp-c-bg'),
      },
    });
    const { svg } = await mermaid.render(id, decodeURIComponent(props.code));
    host.value.innerHTML = svg;
  }

  onMounted(draw);
  watch(isDark, draw);
</script>

<template>
  <div
    ref="host"
    class="ls-mermaid"
  />
</template>
