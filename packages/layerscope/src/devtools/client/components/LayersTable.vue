<script setup lang="ts">
  import type { LayerStat } from '#src/devtools/protocol.ts';

  defineProps<{ layers: LayerStat[]; compact?: boolean }>();
</script>

<template>
  <table class="layers num">
    <thead>
      <tr>
        <th scope="col">Layer</th>
        <th
          v-if="!compact"
          scope="col"
        >
          Root
        </th>
        <th scope="col">May depend on</th>
        <th scope="col">Files</th>
        <th scope="col">Refs in</th>
        <th scope="col">Refs out</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="layer in layers"
        :key="layer.name"
      >
        <th scope="row">{{ layer.name }}</th>
        <td v-if="!compact">
          <code>{{ layer.root }}</code>
        </td>
        <td>
          <em
            v-if="layer.allow === null"
            class="muted"
          >
            ◇ unrestricted
          </em>
          <span v-else-if="layer.allow.length === 0">nothing</span>
          <span v-else>{{ layer.allow.join(', ') }}</span>
        </td>
        <td>{{ layer.files }}</td>
        <td>{{ layer.refsIn }}</td>
        <td>{{ layer.refsOut }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
  .layers {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    height: var(--row);
    padding: 0 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
  }

  thead th {
    color: var(--fg-muted);
    font-weight: 500;
  }

  tbody th {
    font-weight: 500;
  }
</style>
