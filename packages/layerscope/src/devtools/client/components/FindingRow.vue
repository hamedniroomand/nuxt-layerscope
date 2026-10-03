<script setup lang="ts">
  import FileLocation from '#src/devtools/client/components/FileLocation.vue';
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import { location } from '#src/devtools/client/lib/format.ts';
  import type { TabFinding } from '#src/devtools/protocol.ts';

  import HintLine from './HintLine.vue';
  import SeverityGlyph from './SeverityGlyph.vue';

  defineProps<{
    finding: TabFinding;
    selected: boolean;
    picked: boolean;
    picking: boolean;
    /** The one row in the list that Tab reaches: the selected one, or the first. */
    tabStop: boolean;
    /** False when the group header already names the rule. */
    showRule: boolean;
  }>();
  const { demo } = useTab();
  defineEmits<{
    select: [];
    open: [file: string, line: number, column: number];
    trace: [symbol: string];
    pick: [range: boolean];
    ignore: [];
  }>();
</script>

<template>
  <li
    class="row"
    :class="{ selected }"
    :aria-current="selected ? 'true' : undefined"
    :tabindex="tabStop ? 0 : -1"
    @click="$emit('select')"
    @focus="$emit('select')"
  >
    <div class="line">
      <input
        v-if="!demo"
        class="pick"
        :class="{ shown: picking }"
        type="checkbox"
        :checked="picked"
        :aria-label="`Pick ${finding.symbol} for a bulk action`"
        aria-keyshortcuts="x"
        @click.stop="$emit('pick', ($event as MouseEvent).shiftKey)"
      />
      <SeverityGlyph :severity="finding.severity" />
      <span
        v-if="finding.isNew"
        class="new"
      >
        NEW
      </span>
      <span
        v-if="finding.toLayer && finding.toLayer !== finding.fromLayer"
        class="pair"
      >
        <b>{{ finding.fromLayer }}</b> → <b>{{ finding.toLayer }}</b>
      </span>
      <span class="message">{{ finding.message }}</span>
      <span class="sr-only">{{ finding.severity === 'error' ? 'error' : 'warning' }}</span>
    </div>
    <div class="line muted">
      <FileLocation
        :file="finding.absFile"
        :line="finding.line"
        :column="finding.column"
      >
        {{ location(finding.file, finding.line, finding.column) }}
      </FileLocation>
      <span
        v-if="finding.target"
        class="mono"
      >
        → {{ finding.target }}
      </span>
      <span
        v-if="showRule"
        class="rule"
      >
        {{ finding.rule }}
      </span>
    </div>
    <HintLine
      v-if="selected"
      :finding="finding"
    />
    <div class="actions">
      <slot name="actions" />
      <button
        v-if="!demo"
        type="button"
        aria-keyshortcuts="i"
        @click.stop="$emit('ignore')"
      >
        Ignore
      </button>
      <button
        type="button"
        aria-keyshortcuts="t"
        @click.stop="$emit('trace', finding.symbol)"
      >
        Trace
      </button>
      <button
        v-if="!demo"
        type="button"
        aria-keyshortcuts="o"
        @click.stop="$emit('open', finding.absFile, finding.line, finding.column)"
      >
        Open
      </button>
    </div>
  </li>
</template>

<style scoped>
  .row {
    position: relative;
    display: grid;
    gap: 2px;
    /* The left gutter holds the pick checkbox, so both lines of the row start at one edge. */
    padding: 6px 14px 6px 32px;
    border-left: 2px solid transparent;
    border-bottom: 1px solid var(--line);
    list-style: none;
    cursor: default;
  }

  .row.selected {
    border-left-color: var(--accent);
    background: var(--tint-selected);
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .line a,
  .line .file {
    color: var(--fg-muted);
    text-decoration: none;
  }

  .line a:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .pair {
    color: var(--fg-muted);
  }

  .pair b {
    color: var(--fg);
    font-weight: 500;
  }

  .rule {
    margin-left: auto;
  }

  .pick {
    position: absolute;
    top: 8px;
    left: 10px;
    margin: 0;
    opacity: 0;
  }

  .pick.shown,
  .row:hover .pick,
  .row:focus-within .pick,
  .row.selected .pick {
    opacity: 1;
  }

  .new {
    padding: 0 4px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    color: var(--accent);
    font-size: 10px;
    letter-spacing: 0.04em;
    line-height: 14px;
  }

  .actions {
    display: none;
    justify-content: flex-end;
    gap: 6px;
  }

  .row:hover .actions,
  .row:focus-within .actions,
  .row.selected .actions {
    display: flex;
  }
</style>
