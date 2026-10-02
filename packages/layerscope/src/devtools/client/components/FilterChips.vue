<script setup lang="ts">
  import type { ChipCount } from '#src/devtools/client/lib/filters.ts';

  import SeverityGlyph from './SeverityGlyph.vue';

  defineProps<{
    severities: ChipCount[];
    rules: ChipCount[];
    sev: string[];
    rule: string[];
    pair: string | null;
    file: string | null;
  }>();
  defineEmits<{
    toggleSev: [value: string];
    toggleRule: [value: string];
    clearPair: [];
    clearFile: [];
  }>();
</script>

<template>
  <div
    class="chips"
    role="group"
    aria-label="Filters"
  >
    <button
      v-for="chip in severities"
      :key="`sev-${chip.value}`"
      type="button"
      class="chip"
      :aria-pressed="sev.includes(chip.value)"
      @click="$emit('toggleSev', chip.value)"
    >
      <SeverityGlyph :severity="chip.value === 'error' ? 'error' : 'warn'" />
      {{ chip.value }}
      <span class="num muted">{{ chip.count }}</span>
    </button>
    <button
      v-for="chip in rules"
      :key="`rule-${chip.value}`"
      type="button"
      class="chip"
      :aria-pressed="rule.includes(chip.value)"
      @click="$emit('toggleRule', chip.value)"
    >
      {{ chip.value }}
      <span class="num muted">{{ chip.count }}</span>
    </button>
    <button
      v-if="pair"
      type="button"
      class="chip"
      aria-pressed="true"
      :aria-label="`Clear layer pair filter ${pair.replace(':', ' to ')}`"
      @click="$emit('clearPair')"
    >
      {{ pair.replace(':', ' → ') }}
      <span
        class="muted"
        aria-hidden="true"
      >
        ×
      </span>
    </button>
    <button
      v-if="file"
      type="button"
      class="chip mono"
      aria-pressed="true"
      :aria-label="`Clear file filter ${file}`"
      @click="$emit('clearFile')"
    >
      {{ file }}
      <span
        class="muted"
        aria-hidden="true"
      >
        ×
      </span>
    </button>
  </div>
</template>

<style scoped>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 9px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
  }

  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--tint-accent);
  }
</style>
