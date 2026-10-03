<script setup lang="ts">
  import { onBeforeUnmount, ref } from 'vue';

  import { useTab } from '#src/devtools/client/lib/context.ts';
  import type { TabItem } from '#src/devtools/client/lib/router.ts';

  import ShortcutSheet from './ShortcutSheet.vue';

  defineProps<{ tabs: TabItem[] }>();

  const { nav, shortcuts } = useTab();
  const sheet = ref(false);
  onBeforeUnmount(
    shortcuts.register({
      key: '?',
      label: 'Show the keyboard shortcuts',
      run: () => {
        sheet.value = true;
      },
    }),
  );
</script>

<template>
  <nav
    class="tabs"
    aria-label="Views"
  >
    <div
      class="list"
      role="tablist"
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
    </div>
    <button
      type="button"
      class="tab help"
      aria-label="Keyboard shortcuts"
      aria-keyshortcuts="?"
      @click="sheet = true"
    >
      ?
    </button>
    <ShortcutSheet
      v-if="sheet"
      :shortcuts="shortcuts.list()"
      @close="sheet = false"
    />
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

  .list {
    display: flex;
    align-items: center;
  }

  .help {
    margin-left: auto;
  }
</style>
