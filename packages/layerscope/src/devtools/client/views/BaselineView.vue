<script setup lang="ts">
  import { shallowRef } from 'vue';

  import CopyButton from '#src/devtools/client/components/CopyButton.vue';
  import FileLocation from '#src/devtools/client/components/FileLocation.vue';
  import InlineConfirm from '#src/devtools/client/components/InlineConfirm.vue';
  import SeverityGlyph from '#src/devtools/client/components/SeverityGlyph.vue';
  import { entryKey } from '#src/devtools/client/lib/actions.ts';
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import { location } from '#src/devtools/client/lib/format.ts';
  import { useViewData } from '#src/devtools/client/lib/view-data.ts';

  const context = useTab();
  const { api, actions } = context;
  // Entries waiting for the inline confirm: their keys and what the confirm says.
  const pending = shallowRef<{ keys: string[]; message: string } | null>(null);
  const confirm = async (): Promise<void> => {
    const keys = pending.value?.keys ?? [];
    pending.value = null;
    await actions.remove(keys);
  };
  const baseline = useViewData(context, async () => {
    const view = await api.baseline();
    return view;
  });
</script>

<template>
  <section class="baseline">
    <div class="bar">
      <span
        v-if="baseline.data.value?.file"
        class="mono muted"
      >
        {{ baseline.data.value.file }}
      </span>
      <CopyButton
        text="npx layerscope check --update-baseline"
        label="Copy as CLI"
      />
    </div>
    <div
      v-if="actions.lastWrite.value !== null"
      class="bar"
    >
      <span class="muted">The last change to the baseline can be undone.</span>
      <button
        type="button"
        @click="actions.undo()"
      >
        Undo
      </button>
    </div>
    <InlineConfirm
      v-if="pending"
      :message="pending.message"
      action="Remove"
      @confirm="confirm()"
      @cancel="pending = null"
    />
    <p
      v-if="baseline.error.value"
      class="err"
      role="alert"
    >
      {{ baseline.error.value }}
    </p>
    <p
      v-else-if="baseline.data.value && baseline.data.value.file === null"
      class="muted"
    >
      No baseline file. <code>layerscope check --update-baseline</code> writes one that accepts the
      current findings. The tab reads the default file only.
    </p>
    <template v-else-if="baseline.data.value">
      <h3 class="group">
        <span>Suppressed findings</span>
        <span class="num muted">{{ baseline.data.value.suppressed.length }}</span>
      </h3>
      <ul class="rows">
        <li
          v-for="finding in baseline.data.value.suppressed"
          :key="`${finding.key}:${finding.line}:${finding.column}`"
        >
          <span class="what">
            <SeverityGlyph :severity="finding.severity" />
            <span class="message">{{ finding.message }}</span>
          </span>
          <span class="where">
            <FileLocation
              :file="finding.absFile"
              :line="finding.line"
              :column="finding.column"
            >
              {{ location(finding.file, finding.line, finding.column) }}
            </FileLocation>
            <button
              v-if="!context.demo"
              type="button"
              @click="
                pending = {
                  keys: [finding.key],
                  message: `Remove ${finding.symbol} in ${finding.file} from the baseline? It shows as a finding again.`,
                }
              "
            >
              Remove from baseline
            </button>
          </span>
        </li>
      </ul>
      <h3 class="group">
        <span>Removable entries</span>
        <span class="num muted">{{ baseline.data.value.removable.length }}</span>
      </h3>
      <p
        v-if="baseline.data.value.removable.length === 0"
        class="muted"
      >
        Every entry still matches a finding.
      </p>
      <ul class="rows">
        <li
          v-for="entry in baseline.data.value.removable"
          :key="`${entry.rule}:${entry.file}:${entry.symbol}:${entry.toLayer}`"
        >
          <span class="what">
            <span>{{ entry.rule }}</span>
            <span class="mono">{{ entry.file }}</span>
            <span>{{ entry.symbol }}</span>
            <span
              v-if="(entry.count ?? 1) > 1"
              class="num"
            >
              ×{{ entry.count }}
            </span>
          </span>
          <span class="where">
            <button
              v-if="!context.demo"
              type="button"
              @click="
                pending = {
                  keys: [entryKey(entry)],
                  message: `Remove the stale entry for ${entry.symbol} in ${entry.file}?`,
                }
              "
            >
              Remove
            </button>
          </span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
  .baseline {
    display: grid;
    gap: 6px;
    padding: 10px 14px;
    color: var(--fg-muted);
  }

  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .baseline p {
    margin: 0;
  }

  .group {
    display: flex;
    justify-content: space-between;
    margin: 6px 0 0;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
    color: var(--fg);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The text wraps in the first column; the location and the button stay on one line. */
  .rows li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 3px 0;
  }

  .what,
  .where {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-height: calc(var(--row) - 6px);
  }

  /* The button padding and border (3px) move its text down; the text on the left moves with it. */
  .what {
    flex-wrap: wrap;
    padding-top: 3px;
  }

  /* A zero basis keeps a long message on the glyph's line; it wraps inside its own box. */
  .message {
    flex: 1 1 0;
    min-width: 0;
  }

  .where {
    white-space: nowrap;
  }

  .rows a,
  .rows .file {
    text-decoration: none;
  }
</style>
