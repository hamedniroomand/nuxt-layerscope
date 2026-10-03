<script setup lang="ts">
  import { nextTick, onBeforeUnmount, useTemplateRef } from 'vue';

  import FilterChips from '#src/devtools/client/components/FilterChips.vue';
  import FindingRow from '#src/devtools/client/components/FindingRow.vue';
  import SeverityGlyph from '#src/devtools/client/components/SeverityGlyph.vue';
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import { useFindingsView } from '#src/devtools/client/lib/findings-view.ts';

  const context = useTab();
  const view = useFindingsView(context);
  const list = useTemplateRef<HTMLElement>('list');

  const reveal = async (step: number): Promise<void> => {
    view.move(step);
    await nextTick();
    list.value?.querySelector<HTMLElement>('.selected')?.scrollIntoView({ block: 'nearest' });
  };
  const removers = [
    context.shortcuts.register({ key: 'j', label: 'Next finding', run: () => reveal(1) }),
    context.shortcuts.register({ key: 'k', label: 'Previous finding', run: () => reveal(-1) }),
    context.shortcuts.register({ key: 'o', label: 'Open in editor', run: view.openSelected }),
    context.shortcuts.register({
      key: 't',
      label: 'Trace the selected finding',
      run: () => {
        const finding = view.current();
        if (finding !== undefined) {
          context.nav.trace(finding.symbol);
        }
      },
    }),
    context.shortcuts.register({
      key: 'n',
      label: 'Next new finding',
      run: async () => {
        view.nextNew();
        await reveal(0);
      },
    }),
  ];
  onBeforeUnmount(() => {
    for (const remove of removers) {
      remove();
    }
  });
</script>

<template>
  <section class="findings">
    <div class="filters">
      <FilterChips
        :severities="view.severities.value"
        :rules="view.rules.value"
        :sev="view.query.value.sev"
        :rule="view.query.value.rule"
        :pair="view.query.value.pair"
        :file="view.query.value.file"
        @toggle-sev="view.toggleSev"
        @toggle-rule="view.toggleRule"
        @clear-pair="view.update({ pair: null })"
        @clear-file="view.update({ file: null })"
      />
      <div class="controls">
        <input
          v-model="view.text.value"
          class="search"
          type="search"
          placeholder="Filter by file, symbol or message…"
          aria-label="Filter findings"
          aria-keyshortcuts="/"
        />
        <label>
          Group:
          <select
            :value="view.query.value.group"
            @change="view.setGroup(($event.target as HTMLSelectElement).value)"
          >
            <option value="rule">rule</option>
            <option value="file">file</option>
            <option value="pair">layer pair</option>
            <option value="none">none</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            :checked="view.query.value.onlyNew"
            @change="view.update({ onlyNew: ($event.target as HTMLInputElement).checked })"
          />
          New only
        </label>
      </div>
    </div>
    <p
      v-if="view.total.value === 0"
      class="empty"
    >
      No findings. The architecture matches the rules.
    </p>
    <p
      v-else-if="view.rows.value.length === 0"
      class="empty"
    >
      No findings match the filters.
    </p>
    <div
      v-else
      ref="list"
    >
      <section
        v-for="group in view.groups.value"
        :key="group.key"
      >
        <h3 class="group">
          <span>
            <SeverityGlyph :severity="group.severity" />
            {{ group.label }}
          </span>
          <span class="num muted">{{ group.findings.length }}</span>
        </h3>
        <ul
          class="rows"
          role="listbox"
          :aria-label="group.label"
        >
          <FindingRow
            v-for="finding in group.findings"
            :key="view.idOf(finding)"
            :finding="finding"
            :selected="view.selected.value === view.idOf(finding)"
            @select="view.select(finding)"
            @open="view.open"
            @trace="context.nav.trace"
          />
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
  .filters {
    display: grid;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .search {
    flex: 1;
    min-width: 160px;
  }

  .group {
    display: flex;
    justify-content: space-between;
    margin: 0;
    padding: 6px 14px;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--line);
  }

  .rows {
    margin: 0;
    padding: 0;
  }

  .empty {
    padding: 12px 14px;
    color: var(--fg-muted);
  }
</style>
