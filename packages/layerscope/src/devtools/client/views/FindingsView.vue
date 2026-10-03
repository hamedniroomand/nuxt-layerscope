<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue';

  import FilterChips from '#src/devtools/client/components/FilterChips.vue';
  import FindingRow from '#src/devtools/client/components/FindingRow.vue';
  import InlineConfirm from '#src/devtools/client/components/InlineConfirm.vue';
  import SeverityGlyph from '#src/devtools/client/components/SeverityGlyph.vue';
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import { useFindingsView } from '#src/devtools/client/lib/findings-view.ts';
  import { useIgnoreFlow } from '#src/devtools/client/lib/ignore-flow.ts';
  import { useProgressive } from '#src/devtools/client/lib/progressive.ts';

  const context = useTab();
  const view = useFindingsView(context);
  const ignore = useIgnoreFlow(context, view);
  // Long lists render a frame at a time; selection and keys still work on the whole list.
  const progressive = useProgressive(
    () => view.rows.value.length,
    () => JSON.stringify(view.query.value),
  );
  const shownGroups = computed(() => {
    let left = progressive.shown.value;
    return view.groups.value.flatMap(group => {
      if (left <= 0) {
        return [];
      }
      const shown = group.findings.slice(0, left);
      left -= shown.length;
      return [{ ...group, shown }];
    });
  });
  watch(view.selected, () => {
    const finding = view.current();
    if (finding !== undefined) {
      progressive.reveal(view.rows.value.indexOf(finding));
    }
  });
  const list = useTemplateRef<HTMLElement>('list');

  const reveal = async (step: number): Promise<void> => {
    view.move(step);
    await nextTick();
    // Focus follows the selection, so screen readers announce the row; focus also scrolls.
    list.value?.querySelector<HTMLElement>('.selected')?.focus();
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
    <div
      v-if="ignore.pending.value || ignore.multi.count.value > 0"
      class="bulk"
    >
      <InlineConfirm
        v-if="ignore.pending.value"
        :message="ignore.pending.value.message"
        action="Add"
        @confirm="ignore.confirm()"
        @cancel="ignore.cancel()"
      />
      <template v-else>
        <span class="num">{{ ignore.multi.count.value }} picked</span>
        <button
          type="button"
          @click="ignore.askPicked()"
        >
          Ignore picked
        </button>
        <button
          type="button"
          @click="ignore.multi.clear()"
        >
          Clear
        </button>
      </template>
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
        v-for="group in shownGroups"
        :key="group.key"
      >
        <h3 class="group">
          <span>
            <SeverityGlyph :severity="group.severity" />
            {{ group.label }}
          </span>
          <span class="group-end">
            <button
              type="button"
              class="quiet"
              @click="ignore.ask(group.findings)"
            >
              Ignore all {{ group.findings.length }}
            </button>
          </span>
        </h3>
        <ul
          class="rows"
          :aria-label="group.label"
        >
          <FindingRow
            v-for="finding in group.shown"
            :key="view.idOf(finding)"
            :finding="finding"
            :selected="view.selected.value === view.idOf(finding)"
            :picked="ignore.multi.has(view.idOf(finding))"
            :picking="ignore.multi.count.value > 0"
            :show-rule="view.query.value.group !== 'rule'"
            :tab-stop="
              view.selected.value === null
                ? view.rows.value[0] === finding
                : view.selected.value === view.idOf(finding)
            "
            @select="view.select(finding)"
            @pick="ignore.multi.toggle(view.idOf(finding), $event)"
            @ignore="ignore.ask([finding])"
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

  .bulk {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
  }

  .group-end {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .quiet {
    border-color: transparent;
    color: var(--fg-muted);
    font-weight: 400;
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
