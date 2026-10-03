<script setup lang="ts">
  import { computed, ref } from 'vue';

  import { suggestSymbols } from '#src/devtools/client/lib/autocomplete.ts';
  import type { SymbolEntry } from '#src/devtools/protocol.ts';

  const props = defineProps<{ symbols: SymbolEntry[]; initial: string }>();
  const emit = defineEmits<{ pick: [name: string]; focus: [] }>();

  const text = ref(props.initial);
  const active = ref(0);
  const open = ref(false);
  const options = computed(() => suggestSymbols(props.symbols, text.value));

  const pick = (name: string): void => {
    text.value = name;
    open.value = false;
    emit('pick', name);
  };
  const onKey = (event: KeyboardEvent): void => {
    const count = options.value.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open.value = true;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active.value = count === 0 ? 0 : (active.value + step + count) % count;
    } else if (event.key === 'Enter') {
      pick(options.value[active.value]?.name ?? text.value.trim());
    } else if (event.key === 'Escape') {
      open.value = false;
    }
  };
  const onInput = (): void => {
    open.value = true;
    active.value = 0;
  };
</script>

<template>
  <div class="search">
    <input
      v-model="text"
      type="search"
      role="combobox"
      placeholder="Symbol, such as useCart or BaseButton…"
      aria-label="Symbol to trace"
      aria-autocomplete="list"
      aria-controls="symbol-options"
      aria-keyshortcuts="/"
      :aria-expanded="open && options.length > 0"
      @focus="emit('focus')"
      @input="onInput"
      @keydown="onKey"
    />
    <ul
      v-if="open && options.length > 0"
      id="symbol-options"
      role="listbox"
      class="options"
    >
      <li
        v-for="(option, index) in options"
        :key="`${option.kind}:${option.name}`"
        role="option"
        :aria-selected="index === active"
        @mousedown.prevent="pick(option.name)"
      >
        <span>{{ option.name }}</span>
        <span class="muted">
          {{ option.kind === 'component' ? 'component' : option.contexts.join(', ') }} ·
          {{ option.layer ?? 'package' }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
  .search {
    position: relative;
    max-width: 420px;
  }

  input {
    width: 100%;
  }

  .options {
    position: absolute;
    z-index: 1;
    left: 0;
    right: 0;
    margin: 2px 0 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    list-style: none;
  }

  .options li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    cursor: pointer;
  }

  .options li[aria-selected='true'] {
    background: var(--bg-raised);
  }
</style>
