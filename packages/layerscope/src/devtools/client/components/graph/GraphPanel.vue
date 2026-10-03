<script setup lang="ts">
  import { computed } from 'vue';

  import { useTab } from '#src/devtools/client/lib/context.ts';
  import type { GraphSelection } from '#src/devtools/client/lib/graph-model.ts';
  import { symbolLabel } from '#src/devtools/client/lib/graph-model.ts';
  import { usePanel } from '#src/devtools/client/lib/graph-panel.ts';
  import type { GraphView } from '#src/devtools/protocol.ts';

  const props = defineProps<{ view: GraphView; selection: GraphSelection }>();
  defineEmits<{ close: [] }>();

  const { api, nav } = useTab();
  const panel = usePanel(useTab(), () => props.selection);
  const stat = computed(() => {
    const { selection } = props;
    return selection?.kind === 'node'
      ? props.view.nodes.find(node => node.id === selection.layer)
      : undefined;
  });
  const graphEdge = computed(() => {
    const { selection } = props;
    return selection?.kind === 'edge'
      ? props.view.edges.find(edge => edge.from === selection.from && edge.to === selection.to)
      : undefined;
  });
</script>

<template>
  <aside
    class="panel"
    aria-label="Selection details"
  >
    <header class="head">
      <h3 v-if="selection?.kind === 'node'">Layer {{ selection.layer }}</h3>
      <h3 v-else-if="selection?.kind === 'edge'">{{ selection.from }} → {{ selection.to }}</h3>
      <button
        type="button"
        aria-label="Close details"
        aria-keyshortcuts="Escape"
        @click="$emit('close')"
      >
        ×
      </button>
    </header>
    <p
      v-if="panel.error.value"
      class="err"
      role="alert"
    >
      {{ panel.error.value }}
      <button
        type="button"
        @click="panel.reload()"
      >
        Retry
      </button>
    </p>
    <template v-if="selection?.kind === 'node' && stat">
      <dl class="facts num">
        <dt>Root</dt>
        <dd class="mono">{{ stat.root }}</dd>
        <dt>May depend on</dt>
        <dd>{{ stat.allow === null ? '◇ unrestricted' : stat.allow.join(', ') || 'nothing' }}</dd>
        <dt>Files</dt>
        <dd>{{ stat.files }}</dd>
        <dt>Refs in / out</dt>
        <dd>{{ stat.refsIn }} / {{ stat.refsOut }}</dd>
      </dl>
      <template v-if="panel.node.value">
        <h4>Uses</h4>
        <ul class="list">
          <li
            v-for="out in panel.node.value.out"
            :key="out.layer"
          >
            <a
              href="#"
              @click.prevent="
                nav.go({
                  view: 'graph',
                  query: nav.route.value.query,
                  param: `edge/${selection.layer}/${out.layer}`,
                })
              "
            >
              {{ out.layer }}
            </a>
            <span class="num muted">{{ out.count }}</span>
          </li>
        </ul>
        <h4>Used by</h4>
        <ul class="list">
          <li
            v-for="into in panel.node.value.in"
            :key="into.layer"
          >
            <a
              href="#"
              @click.prevent="
                nav.go({
                  view: 'graph',
                  query: nav.route.value.query,
                  param: `edge/${into.layer}/${selection.layer}`,
                })
              "
            >
              {{ into.layer }}
            </a>
            <span class="num muted">{{ into.count }}</span>
          </li>
        </ul>
        <h4>
          Files <span class="num muted">{{ panel.node.value.total }}</span>
        </h4>
        <ul class="list">
          <li
            v-for="file in panel.node.value.files"
            :key="file.file"
          >
            <a
              class="mono"
              href="#"
              @click.prevent="api.openInEditor(file.absFile)"
            >
              {{ file.file }}
            </a>
            <span class="num muted">{{ file.refsIn }} / {{ file.refsOut }}</span>
          </li>
        </ul>
        <button
          v-if="panel.node.value.files.length < panel.node.value.total"
          type="button"
          @click="panel.more()"
        >
          Show more
        </button>
      </template>
    </template>
    <template v-else-if="selection?.kind === 'edge'">
      <p
        v-if="graphEdge"
        class="muted num"
      >
        {{ graphEdge.status }} · {{ graphEdge.count }} references
        <span
          v-if="graphEdge.violations > 0"
          class="err"
        >
          · !{{ graphEdge.violations }} findings
        </span>
      </p>
      <div class="actions">
        <button
          type="button"
          @click="nav.open('findings', { pair: `${selection.from}:${selection.to}` })"
        >
          Filter findings
        </button>
      </div>
      <template v-if="panel.edge.value">
        <p
          v-if="panel.edge.value.truncated > 0"
          class="muted"
        >
          Showing {{ panel.edge.value.total - panel.edge.value.truncated }} of
          {{ panel.edge.value.total }}.
        </p>
        <details
          v-for="symbol in panel.edge.value.symbols"
          :key="symbol.symbol"
          class="symbol"
        >
          <summary>
            <span class="name">
              <span :title="symbol.symbol">{{ symbolLabel(symbol.symbol) }}</span>
              <span class="chip">{{ symbol.kind }}</span>
            </span>
            <span class="num muted">{{ symbol.count }}</span>
          </summary>
          <ul class="list">
            <li
              v-for="row in symbol.rows"
              :key="`${row.file}:${row.line}:${row.column}`"
            >
              <a
                class="mono"
                href="#"
                @click.prevent="api.openInEditor(row.absFile, row.line, row.column)"
              >
                {{ row.file }}:{{ row.line }}
              </a>
            </li>
          </ul>
          <button
            type="button"
            @click="nav.trace(symbol.symbol)"
          >
            Trace {{ symbolLabel(symbol.symbol) }}
          </button>
        </details>
      </template>
    </template>
  </aside>
</template>

<style scoped>
  .panel {
    min-width: 0;
    padding: 10px 14px;
    border-left: 1px solid var(--line);
    overflow: auto;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .head h3 {
    margin: 0;
  }

  h4 {
    margin: 10px 0 4px;
    font-size: 12px;
    font-weight: 600;
  }

  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 8px 0;
  }

  .facts dt {
    color: var(--fg-muted);
  }

  .facts dd {
    margin: 0;
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    min-height: 24px;
    align-items: center;
  }

  .list a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-decoration: none;
  }

  .list a:hover {
    color: var(--accent);
  }

  .actions {
    display: flex;
    gap: 6px;
    margin: 6px 0;
  }

  .symbol {
    padding: 4px 0;
    border-top: 1px solid var(--line);
  }

  .symbol summary {
    display: flex;
    justify-content: space-between;
    cursor: pointer;
  }

  /* The kind tells apart two references with the same label, such as an auto-import and an import. */
  .chip {
    margin-left: 6px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 9px;
    color: var(--fg-muted);
    font-size: 11px;
  }

  @media (max-width: 900px) {
    .panel {
      border-left: 0;
      border-top: 1px solid var(--line);
    }
  }
</style>
