<script setup lang="ts">
  import { computed } from 'vue';

  import type { TabFinding } from '#src/devtools/protocol.ts';

  import CopyButton from './CopyButton.vue';

  const props = defineProps<{ finding: TabFinding }>();

  /** `Allow "admin" to use "web": resolves 4 findings in 3 files, 1 already in baseline`. */
  const allowText = computed(() => {
    const { hint } = props.finding;
    if (hint === undefined) {
      return '';
    }
    const findings = `${hint.resolves} finding${hint.resolves === 1 ? '' : 's'}`;
    const files = `${hint.files} file${hint.files === 1 ? '' : 's'}`;
    const baselined = hint.baselined === 0 ? '' : `, ${hint.baselined} already in baseline`;
    const only = hint.only === undefined ? '' : ` (only ${hint.only.join(', ')})`;
    return `Allow "${hint.layer}" to use "${hint.add}"${only}: resolves ${findings} in ${files}${baselined}`;
  });
</script>

<template>
  <div
    v-if="finding.suggestion"
    class="hint"
  >
    <span v-if="finding.hint">
      <b>Suggestion:</b>
      {{ allowText }}
    </span>
    <span v-else>
      <b>Suggestion:</b>
      {{ finding.suggestion.message }}
    </span>
    <template v-if="finding.hint">
      <pre class="mono snippet">{{ finding.hint.snippet }}</pre>
      <CopyButton
        :text="finding.hint.snippet"
        label="Copy snippet"
      />
    </template>
  </div>
</template>

<style scoped>
  .hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--fg-muted);
  }

  .hint b {
    color: var(--accent);
    font-weight: 500;
  }

  .snippet {
    flex-basis: 100%;
    margin: 2px 0;
    padding: 4px 8px;
    border-radius: 3px;
    background: var(--bg-raised);
    color: var(--fg);
  }
</style>
