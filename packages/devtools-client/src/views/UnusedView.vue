<script setup lang="ts">
  import { computed } from 'vue';

  import CopyButton from '#client/components/CopyButton.vue';
  import FileLocation from '#client/components/FileLocation.vue';
  import { useTab } from '#client/lib/context.ts';
  import { plural } from '#client/lib/format.ts';
  import { useViewData } from '#client/lib/view-data.ts';
  import { unusedGroups } from '#client/lib/view-groups.ts';

  const context = useTab();
  const { api, nav } = context;
  const unused = useViewData(context, async () => {
    const view = await api.unused();
    return view;
  });
  const groups = computed(() =>
    unused.data.value === null ? [] : unusedGroups(unused.data.value),
  );
  const unreadable = computed(
    () => unused.data.value?.blindSpots.find(spot => spot.kind === 'unreadable')?.files ?? [],
  );
</script>

<template>
  <section class="unused">
    <div class="bar">
      <span
        v-if="unused.data.value"
        class="muted num"
      >
        {{ plural(unused.data.value.unused.length, 'unused symbol') }} in
        {{ plural(groups.length, 'layer') }}
      </span>
      <CopyButton
        text="npx layerscope unused"
        label="Copy as CLI"
      />
    </div>
    <p
      v-if="unused.data.value?.possiblyUsed"
      class="banner"
    >
      The project renders components chosen at runtime (<code>&lt;component :is&gt;</code>,
      <code>&lt;NuxtIsland :name&gt;</code>, and <code>resolveComponent(x)</code> or
      <code>resolveDynamicComponent(x)</code> with a value that is not a fixed string), so a
      component listed here may still be used.
    </p>
    <p
      v-for="line in unused.data.value?.blindSpotLines ?? []"
      :key="line"
      class="muted"
    >
      {{ line }}
    </p>
    <template v-if="unreadable.length > 0">
      <p class="banner">{{ unused.data.value?.unreadableLine }}</p>
      <ul class="rows unreadable">
        <li
          v-for="item in unreadable"
          :key="item.file"
        >
          <FileLocation
            class="muted"
            :file="item.absFile ?? item.file"
          >
            {{ item.file }}
          </FileLocation>
          <span class="muted">{{ item.reason }}</span>
        </li>
      </ul>
    </template>
    <p
      v-if="unused.error.value"
      class="err"
      role="alert"
    >
      {{ unused.error.value }}
    </p>
    <p
      v-else-if="unused.data.value && groups.length === 0 && unreadable.length === 0"
      class="ok"
    >
      {{ unused.data.value.emptyLine }}
    </p>
    <section
      v-for="group in groups"
      :key="group.layer"
    >
      <h3 class="group">
        <span>{{ group.layer }}</span>
        <span class="num muted">{{ group.rows.length }}</span>
      </h3>
      <ul class="rows">
        <li
          v-for="row in group.rows"
          :key="`${row.kind}:${row.name}:${row.file}`"
        >
          <span>{{ row.name }}</span>
          <span class="chip">{{ row.label }}</span>
          <FileLocation
            class="muted"
            :file="row.absFile ?? row.file"
          >
            {{ row.file }}
          </FileLocation>
          <button
            type="button"
            @click="nav.trace(row.name)"
          >
            Trace
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
  .unused {
    display: grid;
    gap: 6px;
    padding: 10px 14px;
  }

  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .unused p {
    margin: 0;
  }

  .banner {
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--warn);
  }

  .group {
    display: flex;
    justify-content: space-between;
    margin: 6px 0 0;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--row);
  }

  .rows a,
  .rows .file {
    margin-left: auto;
    text-decoration: none;
  }

  .chip {
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 9px;
    color: var(--fg-muted);
    font-size: 11px;
  }
</style>
