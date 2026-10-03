<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

  import type { Shortcut } from '#src/devtools/client/lib/shortcuts.ts';
  import { sheetRows } from '#src/devtools/client/lib/shortcuts.ts';

  const props = defineProps<{ shortcuts: Shortcut[] }>();
  const emit = defineEmits<{ close: [] }>();

  const dialog = useTemplateRef<HTMLElement>('dialog');
  const rows = computed(() => sheetRows(props.shortcuts));
  // Focus returns to whatever opened the sheet.
  const opener = document.activeElement as HTMLElement | null;

  /** Keeps Tab inside the dialog, and closes it with Esc. */
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      emit('close');
      return;
    }
    if (event.key !== 'Tab' || dialog.value === null) {
      return;
    }
    const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button')];
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  onMounted(() => dialog.value?.querySelector<HTMLElement>('button')?.focus());
  onBeforeUnmount(() => opener?.focus());
</script>

<template>
  <div
    class="backdrop"
    @click.self="emit('close')"
  >
    <div
      ref="dialog"
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-title"
      @keydown="onKey"
    >
      <header>
        <h3 id="shortcut-title">Keyboard shortcuts</h3>
        <button
          type="button"
          aria-label="Close"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <table>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.key"
          >
            <th scope="row">
              <kbd>{{ row.key }}</kbd>
            </th>
            <td>{{ row.label }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">Keys do nothing while you type in a field, except Esc.</p>
    </div>
  </div>
</template>

<style scoped>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--bg) 60%, transparent);
  }

  .sheet {
    min-width: 280px;
    max-height: 80vh;
    padding: 12px 16px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
  }

  th {
    padding: 2px 12px 2px 0;
    text-align: left;
  }

  kbd {
    font: var(--mono);
    padding: 0 4px;
    border: 1px solid var(--line);
    border-radius: 3px;
  }

  p {
    margin: 8px 0 0;
  }
</style>
