<script setup lang="ts">
  import { computed } from 'vue';

  import { useTab } from '#src/devtools/client/lib/context.ts';
  import { clock, duration, plural } from '#src/devtools/client/lib/format.ts';
  import { useThemeToggle } from '#src/devtools/client/lib/theme.ts';

  import SeverityGlyph from './SeverityGlyph.vue';

  const { store, nav, demo } = useTab();
  const theme = useThemeToggle();
  const data = computed(() => store.state.data);
  const suppressed = computed(() => data.value?.report.baseline?.suppressed.length ?? 0);
</script>

<template>
  <header class="header">
    <span class="title">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <circle
          cx="4"
          cy="4"
          r="2"
        />
        <circle
          cx="12"
          cy="4"
          r="2"
        />
        <circle
          cx="8"
          cy="12"
          r="2"
        />
        <path d="M5.5 5.2 7 10M10.5 5.2 9 10" />
      </svg>
      Layerscope
    </span>
    <span
      v-if="data"
      class="summary num"
    >
      <span class="muted">
        {{ plural(data.report.summary.files, 'file') }} ·
        {{ plural(data.report.layers.length, 'layer') }}
      </span>
      <a
        href="#/findings?sev=error"
        class="err"
        @click.prevent="nav.open('findings', { sev: ['error'] })"
      >
        <SeverityGlyph severity="error" />
        {{ plural(data.report.summary.errors, 'error') }}
      </a>
      <a
        href="#/findings?sev=warn"
        class="warn"
        @click.prevent="nav.open('findings', { sev: ['warn'] })"
      >
        <SeverityGlyph severity="warn" />
        {{ plural(data.report.summary.warnings, 'warning') }}
      </a>
      <a
        v-if="suppressed > 0"
        href="#/baseline"
        class="muted"
        @click.prevent="nav.open('baseline')"
      >
        {{ suppressed }} in baseline
      </a>
    </span>
    <span class="spacer" />
    <slot name="live" />
    <span
      v-if="data"
      class="muted num"
    >
      analyzed {{ clock(data.analyzedAt) }} in {{ duration(data.durationMs) }}
    </span>
    <button
      v-if="demo"
      type="button"
      :aria-pressed="theme.dark.value"
      @click="theme.toggle()"
    >
      Dark theme
    </button>
    <button
      v-else
      type="button"
      aria-keyshortcuts="r"
      :disabled="store.state.running"
      @click="store.rerun()"
    >
      {{ store.state.running ? 'Running…' : 'Re-run' }}
    </button>
  </header>
</template>

<style scoped>
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    padding: 0 14px;
    min-height: 44px;
    border-bottom: 1px solid var(--line);
    background: var(--bg-raised);
  }

  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }

  .title svg {
    width: 14px;
    height: 14px;
    color: var(--accent);
  }

  .summary {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 12px;
  }

  .summary a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    text-decoration: none;
  }

  .summary a:hover {
    text-decoration: underline;
  }

  .spacer {
    flex: 1;
  }

  @media (max-width: 720px) {
    .spacer {
      flex-basis: 100%;
      height: 0;
    }
  }
</style>
