<script setup lang="ts">
  import { computed, reactive } from 'vue';

  type Layer = 'shared' | 'auth' | 'shop' | 'admin';

  interface Reference {
    file: string;
    position: string;
    subject: string;
    symbol: string;
    from: Layer;
    to: Layer;
    target: string;
  }

  interface Line {
    text: string;
    kind?: 'file' | 'error' | 'dim' | 'ok' | 'fail';
  }

  const LAYERS: Layer[] = ['shared', 'auth', 'shop', 'admin'];
  const START: Record<Layer, Layer[]> = {
    shared: [],
    auth: ['shared'],
    shop: ['shared', 'auth'],
    admin: ['shared', 'auth'],
  };

  // The references of a small sample app. The board does not run layerscope: it applies the
  // layer-boundary rule to this list and prints the result in the format of `layerscope check`.
  const REFERENCES: Reference[] = [
    {
      file: 'layers/shared/app/composables/useCartBadge.ts',
      position: '2:16',
      subject: 'Auto-import "useCart"',
      symbol: 'useCart',
      from: 'shared',
      to: 'shop',
      target: 'layers/shop/app/composables/useCart.ts',
    },
    {
      file: 'layers/auth/app/components/LoginForm.vue',
      position: '12:5',
      subject: 'Component <BaseButton>',
      symbol: 'BaseButton',
      from: 'auth',
      to: 'shared',
      target: 'layers/shared/app/components/BaseButton.vue',
    },
    {
      file: 'layers/shop/app/components/CartSummary.vue',
      position: '4:18',
      subject: 'Auto-import "formatPrice"',
      symbol: 'formatPrice',
      from: 'shop',
      to: 'shared',
      target: 'layers/shared/shared/utils/formatPrice.ts',
    },
    {
      file: 'layers/shop/app/composables/useCart.ts',
      position: '3:16',
      subject: 'Auto-import "useUser"',
      symbol: 'useUser',
      from: 'shop',
      to: 'auth',
      target: 'layers/auth/app/composables/useUser.ts',
    },
    {
      file: 'layers/admin/app/components/AdminPanel.vue',
      position: '2:16',
      subject: 'Auto-import "useCart"',
      symbol: 'useCart',
      from: 'admin',
      to: 'shop',
      target: 'layers/shop/app/composables/useCart.ts',
    },
    {
      file: 'layers/admin/app/components/AdminPanel.vue',
      position: '3:16',
      subject: 'Auto-import "useUser"',
      symbol: 'useUser',
      from: 'admin',
      to: 'auth',
      target: 'layers/auth/app/composables/useUser.ts',
    },
    {
      file: 'layers/admin/app/components/AdminPanel.vue',
      position: '8:4',
      subject: 'Component <CartSummary>',
      symbol: 'CartSummary',
      from: 'admin',
      to: 'shop',
      target: 'layers/shop/app/components/CartSummary.vue',
    },
  ];

  const allow = reactive<Record<Layer, Layer[]>>(structuredClone(START));

  function toggle(layer: Layer, other: Layer): void {
    allow[layer] = allow[layer].includes(other)
      ? allow[layer].filter(name => name !== other)
      : LAYERS.filter(name => name === other || allow[layer].includes(name));
  }

  function reset(): void {
    Object.assign(allow, structuredClone(START));
  }

  const findings = computed(() =>
    REFERENCES.filter(reference => !allow[reference.from].includes(reference.to)),
  );
  const changed = computed(() => JSON.stringify(allow) !== JSON.stringify(START));

  const lines = computed<Line[]>(() => {
    const out: Line[] = [];
    for (const [file, group] of Map.groupBy(findings.value, finding => finding.file)) {
      out.push({ text: file, kind: 'file' });
      for (const finding of group) {
        const allowed = allow[finding.from];
        out.push(
          {
            text: `  ${finding.position.padEnd(8)}error  ${finding.subject} crosses from layer "${finding.from}" into "${finding.to}"  layer-boundary`,
            kind: 'error',
          },
          { text: `${' '.repeat(17)}${finding.symbol} → ${finding.target}`, kind: 'dim' },
          {
            text: `${' '.repeat(17)}allowed for "${finding.from}": ${allowed.length > 0 ? allowed.join(', ') : 'no other layers'}`,
            kind: 'dim',
          },
        );
      }
      out.push({ text: '' });
    }
    return out;
  });
  const count = computed(() => findings.value.length);
  const summary = computed(() =>
    count.value === 0
      ? '✔ No problems in 14 files across 5 layers'
      : `✖ ${count.value} ${count.value === 1 ? 'problem' : 'problems'} (${count.value} ${count.value === 1 ? 'error' : 'errors'}, 0 warnings)`,
  );
</script>

<template>
  <div class="ls-board">
    <div class="ls-board-pane">
      <div class="ls-board-bar">
        <span class="ls-board-name">layerscope.config.ts</span>
        <button
          v-if="changed"
          type="button"
          class="ls-board-reset"
          @click="reset"
        >
          Reset
        </button>
      </div>
      <div
        class="ls-board-config"
        role="group"
        aria-label="Layers that each layer may use"
      >
        <span class="ls-board-code">export default defineConfig({</span>
        <span class="ls-board-code">&nbsp;&nbsp;layers: {</span>
        <div
          v-for="layer in LAYERS"
          :key="layer"
          class="ls-board-row"
          :data-layer="layer"
        >
          <span class="ls-board-key"> <span class="ls-layer-dot" />{{ layer }}: </span>
          <span class="ls-board-code">{ allow: [</span>
          <button
            v-for="other in LAYERS.filter(name => name !== layer)"
            :key="other"
            type="button"
            class="ls-board-chip"
            :data-layer="other"
            :aria-pressed="allow[layer].includes(other)"
            :aria-label="`${layer} may use ${other}`"
            @click="toggle(layer, other)"
          >
            '{{ other }}'
          </button>
          <span class="ls-board-code">] },</span>
        </div>
        <span class="ls-board-code">&nbsp;&nbsp;},</span>
        <span class="ls-board-code">});</span>
      </div>
      <p class="ls-board-hint">Select a layer name in a list to allow it or to remove it.</p>
    </div>

    <div class="ls-board-pane ls-board-term">
      <div class="ls-board-bar">
        <span class="ls-board-name">npx layerscope check</span>
      </div>
      <!-- The key starts the line animation again after each change. -->
      <pre
        :key="JSON.stringify(allow)"
        class="ls-board-output"
      ><code><span
        v-for="(line, index) in lines"
        :key="index"
        class="ls-board-line"
        :class="line.kind && `is-${line.kind}`"
        :style="{ '--i': index }"
      >{{ line.text }}{{ '\n' }}</span><span
        class="ls-board-line"
        :class="count === 0 ? 'is-ok' : 'is-fail'"
        :style="{ '--i': lines.length }"
        role="status"
      >{{ summary }}</span></code></pre>
    </div>
  </div>
</template>
