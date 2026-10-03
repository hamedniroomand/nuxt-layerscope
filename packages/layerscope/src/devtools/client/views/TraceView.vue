<script setup lang="ts">
  import { computed, shallowRef, watch } from 'vue';

  import CopyButton from '#src/devtools/client/components/CopyButton.vue';
  import FileLocation from '#src/devtools/client/components/FileLocation.vue';
  import SymbolSearch from '#src/devtools/client/components/SymbolSearch.vue';
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import { useViewData } from '#src/devtools/client/lib/view-data.ts';
  import { traceGroups, useCount } from '#src/devtools/client/lib/view-groups.ts';
  import type { SymbolEntry } from '#src/devtools/protocol.ts';
  import { STATUS_LABELS } from '#src/report/why.ts';

  const context = useTab();
  const { api, nav } = context;
  const symbol = computed(() => nav.route.value.param ?? '');
  const trace = useViewData(context, async () => {
    // Nothing to trace yet: no request.
    if (symbol.value === '') {
      return null;
    }
    const view = await api.trace(symbol.value);
    return view;
  });
  watch(symbol, () => trace.reload());
  const groups = computed(() => (trace.data.value === null ? [] : traceGroups(trace.data.value)));
  const symbols = shallowRef<SymbolEntry[]>([]);
  // Fetched once, on the first focus of the search box.
  const loadSymbols = async (): Promise<void> => {
    if (symbols.value.length === 0) {
      symbols.value = (await api.symbols()).symbols;
    }
  };
</script>

<template>
  <section class="trace">
    <div class="bar">
      <SymbolSearch
        :symbols="symbols"
        :initial="symbol"
        @focus="loadSymbols"
        @pick="nav.trace"
      />
      <CopyButton
        v-if="symbol"
        :text="`npx layerscope why ${symbol}`"
        label="Copy as CLI"
      />
    </div>
    <p
      v-if="!symbol"
      class="muted"
    >
      Type a component or auto-import to see every use and the layers it crosses.
    </p>
    <p
      v-else-if="trace.error.value"
      class="err"
      role="alert"
    >
      {{ trace.error.value }}
    </p>
    <p
      v-else-if="trace.data.value && groups.length === 0"
      class="muted"
    >
      No uses of "{{ symbol }}" found.
    </p>
    <template v-else-if="trace.data.value">
      <h3 class="heading">
        <span>
          {{ symbol }} →
          <span
            v-for="target in trace.data.value.targets"
            :key="target.file ?? target.external ?? ''"
            class="mono"
          >
            {{ target.file ?? target.external }}
          </span>
        </span>
        <span class="muted num"
          >{{ useCount(trace.data.value) }} uses in {{ groups.length }} layers</span
        >
      </h3>
      <section
        v-for="group in groups"
        :key="group.layer"
      >
        <h3 class="group">
          <span>{{ group.layer }} ({{ STATUS_LABELS[group.status] }})</span>
          <span class="num muted">{{ group.uses.length }}</span>
        </h3>
        <ul class="uses">
          <li
            v-for="use in group.uses"
            :key="`${use.file}:${use.line}:${use.column}`"
          >
            <FileLocation
              :file="use.absFile ?? use.file"
              :line="use.line"
              :column="use.column"
            >
              {{ use.file }}:{{ use.line }}:{{ use.column }}
            </FileLocation>
            <span class="muted">{{ STATUS_LABELS[use.status] }}</span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
  .trace {
    display: grid;
    gap: 8px;
    padding: 10px 14px;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .heading,
  .group {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 0;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }

  .uses {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .uses li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: var(--row);
  }

  .uses a {
    text-decoration: none;
  }

  .uses a:hover {
    color: var(--accent);
  }
</style>
