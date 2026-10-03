<script setup lang="ts">
  import { computed } from 'vue';

  import LayersTable from '#src/devtools/client/components/LayersTable.vue';
  import SeverityGlyph from '#src/devtools/client/components/SeverityGlyph.vue';
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import { plural } from '#src/devtools/client/lib/format.ts';

  const { store, nav } = useTab();
  const report = computed(() => store.state.data?.report);
  const suppressed = computed(() => report.value?.baseline?.suppressed.length ?? 0);
  const source = computed(() =>
    report.value?.source === 'registry' ? 'the module registry' : 'generated .d.ts files',
  );
</script>

<template>
  <section
    v-if="report"
    class="overview"
  >
    <div class="counts num">
      <a
        href="#/findings?sev=error"
        @click.prevent="nav.open('findings', { sev: ['error'] })"
      >
        <span class="err">
          <SeverityGlyph severity="error" />
          {{ plural(report.summary.errors, 'error') }}
        </span>
        <span
          class="muted"
          aria-hidden="true"
        >
          →
        </span>
      </a>
      <a
        href="#/findings?sev=warn"
        @click.prevent="nav.open('findings', { sev: ['warn'] })"
      >
        <span class="warn">
          <SeverityGlyph severity="warn" />
          {{ plural(report.summary.warnings, 'warning') }}
        </span>
        <span
          class="muted"
          aria-hidden="true"
        >
          →
        </span>
      </a>
      <span v-if="suppressed > 0">{{ suppressed }} in baseline</span>
      <a
        v-if="report.newCount > 0"
        href="#/findings?new=1"
        @click.prevent="nav.open('findings', { onlyNew: true })"
      >
        <span>
          <span class="new">NEW</span>
          {{ report.newCount }} since opened
        </span>
        <span
          class="muted"
          aria-hidden="true"
        >
          →
        </span>
      </a>
      <p class="muted">
        {{ plural(report.summary.files, 'file') }} · {{ plural(report.layers.length, 'layer') }}
        <br />
        symbols from {{ source }}
      </p>
    </div>
    <div class="graph-slot">
      <LayersTable
        :layers="report.layerStats"
        compact
      />
    </div>
    <div class="lower">
      <div>
        <h3>Hot files</h3>
        <p
          v-if="report.hotFiles.length === 0"
          class="ok"
        >
          No findings. The architecture matches the rules.
        </p>
        <ul
          v-else
          class="hot"
        >
          <li
            v-for="hot in report.hotFiles"
            :key="hot.file"
          >
            <span class="num">
              <SeverityGlyph :severity="hot.errors > 0 ? 'error' : 'warn'" />
              {{ hot.errors + hot.warnings }}
            </span>
            <a
              class="mono"
              :href="`#/findings?file=${encodeURIComponent(hot.file)}`"
              @click.prevent="nav.open('findings', { file: hot.file })"
            >
              {{ hot.file }}
            </a>
          </li>
        </ul>
        <a
          v-if="report.hotFiles.length > 0"
          href="#/findings"
          @click.prevent="nav.open('findings', {})"
        >
          Show all findings →
        </a>
      </div>
      <div>
        <h3>Notes</h3>
        <p
          v-if="report.notes.length === 0"
          class="muted"
        >
          None.
        </p>
        <p
          v-for="note in report.notes"
          :key="note"
          class="note"
        >
          <SeverityGlyph severity="warn" />
          {{ note }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .overview {
    display: grid;
    grid-template-columns: 240px 1fr;
  }

  .counts {
    display: grid;
    align-content: start;
    gap: 4px;
    padding: 12px 14px;
    border-right: 1px solid var(--line);
  }

  .counts a {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    text-decoration: none;
  }

  .counts a:hover {
    color: var(--accent);
  }

  .new {
    padding: 0 4px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    color: var(--accent);
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .counts p {
    margin: 8px 0 0;
  }

  .graph-slot {
    padding: 10px 14px;
    overflow-x: auto;
  }

  .lower {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--line);
  }

  .lower > div {
    min-width: 0;
    padding: 10px 14px;
  }

  .lower > div + div {
    border-left: 1px solid var(--line);
  }

  .hot {
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }

  .hot li {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 8px;
    align-items: center;
    height: var(--row);
    border-bottom: 1px solid var(--line);
  }

  .hot a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-decoration: none;
  }

  .hot a:hover {
    color: var(--accent);
  }

  .note {
    display: flex;
    gap: 6px;
    align-items: start;
    margin: 0 0 4px;
  }

  @media (max-width: 720px) {
    .overview,
    .lower {
      grid-template-columns: 1fr;
    }

    .lower > div + div {
      border-left: 0;
      border-top: 1px solid var(--line);
    }
  }
</style>
