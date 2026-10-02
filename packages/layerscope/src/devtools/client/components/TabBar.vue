<script setup lang="ts">
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import type { TabItem } from '#src/devtools/client/lib/router.ts';

  defineProps<{ tabs: TabItem[] }>();

  const { nav } = useTab();
</script>

<template>
  <nav
    class="tabs"
    role="tablist"
    aria-label="Views"
  >
    <button
      v-for="(tab, index) in tabs"
      :key="tab.view"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="nav.route.value.view === tab.view"
      :aria-keyshortcuts="String(index + 1)"
      @click="nav.open(tab.view)"
    >
      {{ tab.label }}
      <span
        v-if="tab.badge"
        class="badge num"
      >
        {{ tab.badge }}
      </span>
    </button>
    <a
      class="tab help"
      href="https://layerscope.kitdev.space/guide/devtools"
      target="_blank"
      rel="noopener"
      title="Documentation"
    >
      ?
    </a>
  </nav>
</template>

<style scoped>
  .tabs {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 6px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: var(--fg-muted);
    white-space: nowrap;
    text-decoration: none;
  }

  .tab[aria-selected='true'] {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }

  .badge {
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 16px;
  }

  .help {
    margin-left: auto;
  }
</style>
