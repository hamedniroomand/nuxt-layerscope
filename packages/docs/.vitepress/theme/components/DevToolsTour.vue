<script setup lang="ts">
  import { withBase } from 'vitepress';
  import { ref } from 'vue';

  // One tab for each view of the DevTools tab, in the same order. Each image is a capture in
  // `public/devtools/`. Each alt text is the same as the one in guide/devtools.md. The
  // findings-selected capture is only in the guide.
  const views = [
    {
      name: 'overview',
      label: 'Overview',
      alt: 'The Overview view: 21 files in 5 layers, 2 errors, 3 warnings and 1 finding in the baseline, a small layer graph, and the five files that have findings.',
    },
    {
      name: 'findings',
      label: 'Findings',
      alt: 'The Findings view: 5 findings in three groups: layer-boundary with 2 errors, unresolved-reference with 2 warnings and shadowed-component with 1 warning.',
    },
    {
      name: 'trace',
      label: 'Trace',
      alt: 'The Trace view for useCart: 3 uses in 3 layers, not allowed from ui, allowed from admin, and in the same layer from shop.',
    },
    {
      name: 'unused',
      label: 'Unused',
      alt: 'The Unused view: 2 unused symbols in 2 layers, the AppBadge component in ui and the formatDate auto-import in base, with a note about components chosen at runtime and a line that names the uses that are not counted.',
    },
    {
      name: 'graph',
      label: 'Graph',
      alt: 'The Graph view: five layers from root to base, three violations that run back from right to left, and the ui to shop edge selected with useCart in the side panel.',
    },
    {
      name: 'baseline',
      label: 'Baseline',
      alt: 'The Baseline view: 1 error accepted into layerscope-baseline.json, base using useToast from ui, with a Remove from baseline button.',
    },
  ] as const;

  const active = ref(0);

  // Arrow, Home and End keys move between the tabs, as the WAI-ARIA tabs pattern describes.
  function onKey(event: KeyboardEvent): void {
    const last = views.length - 1;
    const next = {
      ArrowRight: active.value === last ? 0 : active.value + 1,
      ArrowLeft: active.value === 0 ? last : active.value - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    active.value = next;
    // By ID, because Vue does not keep the order of refs in a v-for.
    document.querySelector<HTMLElement>(`#ls-tour-tab-${views[next].name}`)?.focus();
  }
</script>

<template>
  <div class="ls-tour">
    <div
      class="ls-tour-tabs"
      role="tablist"
      aria-label="DevTools views"
      @keydown="onKey"
    >
      <button
        v-for="(view, index) in views"
        :id="`ls-tour-tab-${view.name}`"
        :key="view.name"
        type="button"
        role="tab"
        class="ls-tour-tab"
        :class="{ 'is-active': index === active }"
        :aria-selected="index === active"
        :aria-controls="`ls-tour-panel-${view.name}`"
        :tabindex="index === active ? 0 : -1"
        @click="active = index"
      >
        {{ view.label }}
      </button>
    </div>
    <div class="ls-tour-stage">
      <div
        v-for="(view, index) in views"
        v-show="index === active"
        :id="`ls-tour-panel-${view.name}`"
        :key="view.name"
        role="tabpanel"
        tabindex="0"
        class="ls-tour-panel"
        :aria-labelledby="`ls-tour-tab-${view.name}`"
      >
        <img
          class="ls-shot-light"
          :src="withBase(`/devtools/${view.name}-light.png`)"
          :alt="view.alt"
          width="1200"
          height="720"
          loading="lazy"
          decoding="async"
        />
        <img
          class="ls-shot-dark"
          :src="withBase(`/devtools/${view.name}-dark.png`)"
          :alt="view.alt"
          width="1200"
          height="720"
          loading="lazy"
          decoding="async"
        />
      </div>
    </div>
  </div>
</template>
