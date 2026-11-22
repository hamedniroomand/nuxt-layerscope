<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';

  /** One part of a code line. A part with `layer` is a symbol that Nuxt resolves without an import. */
  interface Part {
    text: string;
    dim?: boolean;
    layer?: 'shared' | 'auth' | 'shop';
    cross?: boolean;
  }

  // The file is in the admin layer, and admin may use shared and auth.
  const LINES: Part[][] = [
    [{ text: '<script setup lang="ts">', dim: true }],
    [
      { text: '  const { total } = ' },
      { text: 'useCart', layer: 'shop', cross: true },
      { text: '();' },
    ],
    [{ text: '  const user = ' }, { text: 'useUser', layer: 'auth' }, { text: '();' }],
    [{ text: '<' + '/script>', dim: true }],
    [{ text: '' }],
    [{ text: '<template>', dim: true }],
    [
      { text: '  <' },
      { text: 'BaseButton', layer: 'shared' },
      { text: '>{{ ' },
      { text: 'formatPrice', layer: 'shared' },
      { text: '(total) }}</BaseButton>' },
    ],
    [{ text: '  <' }, { text: 'CartSummary', layer: 'shop', cross: true }, { text: ' />' }],
    [{ text: '</template>', dim: true }],
  ];
  const DEPENDENCIES = LINES.flat().filter(part => part.layer !== undefined);

  const root = ref<HTMLElement>();
  const open = ref(false);
  let frame = 0;
  let moved = false;
  let observer: IntersectionObserver | undefined;

  function place(x: number, y: number): void {
    root.value?.style.setProperty('--x', `${x}px`);
    root.value?.style.setProperty('--y', `${y}px`);
  }

  function stop(): void {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function follow(event: PointerEvent): void {
    moved = true;
    stop();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    place(event.clientX - box.left, event.clientY - box.top);
  }

  // Until the reader moves the pointer, the lens moves slowly across the code by itself.
  function sweep(time: number): void {
    const code = root.value?.querySelector('.ls-lens-stage');
    if (code === null || code === undefined) {
      return;
    }
    const { width, height } = code.getBoundingClientRect();
    const t = time / 1000;
    // The code is in the left half of the stage, so the path stays there.
    place(width * (0.3 + 0.18 * Math.sin(t * 0.55)), height * (0.5 + 0.3 * Math.sin(t * 0.8 + 1)));
    frame = requestAnimationFrame(sweep);
  }

  onMounted(() => {
    if (root.value === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    // The sweep runs only while the lens is on the screen.
    observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting === true && !moved && frame === 0) {
        frame = requestAnimationFrame(sweep);
      } else if (entry?.isIntersecting !== true) {
        stop();
      }
    });
    observer.observe(root.value);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    stop();
  });
</script>

<template>
  <figure
    ref="root"
    class="ls-lens"
    :class="{ 'is-open': open }"
  >
    <div class="ls-lens-bar">
      <span
        class="ls-layer-dot"
        data-layer="admin"
      />
      <span class="ls-lens-file">layers/admin/app/components/AdminPanel.vue</span>
      <button
        type="button"
        class="ls-lens-toggle"
        :aria-pressed="open"
        @click="open = !open"
      >
        {{ open ? 'Hide the sources' : 'Show all sources' }}
      </button>
    </div>

    <div
      class="ls-lens-stage"
      @pointermove="follow"
    >
      <pre class="ls-lens-code"><code><span
        v-for="(line, index) in LINES"
        :key="index"
        class="ls-lens-line"
      ><span
        v-for="(part, at) in line"
        :key="at"
        :class="{ 'ls-lens-dim': part.dim }"
      >{{ part.text }}</span>{{ '\n' }}</span></code></pre>

      <!-- The same code as the lens shows it. The list below gives this data to screen readers. -->
      <pre
        class="ls-lens-code ls-lens-xray"
        aria-hidden="true"
      ><code><span
        v-for="(line, index) in LINES"
        :key="index"
        class="ls-lens-line"
        :class="{ 'is-cross': line.some(part => part.cross) }"
      ><span
        v-for="(part, at) in line"
        :key="at"
        :class="{ 'ls-lens-dim': part.dim, 'ls-lens-dep': part.layer, 'is-cross': part.cross }"
        :data-layer="part.layer"
      >{{ part.text }}<span
        v-if="part.layer"
        class="ls-lens-from"
      >{{ part.cross ? '✖ ' : '' }}layers/{{ part.layer }}</span></span>{{ '\n' }}</span></code></pre>
      <span
        class="ls-lens-ring"
        aria-hidden="true"
      />
    </div>

    <figcaption class="ls-lens-caption">
      This file has no import statement. Move the pointer across the code to see the layer that each
      symbol comes from.
      <ul class="visually-hidden">
        <li
          v-for="part in DEPENDENCIES"
          :key="part.text"
        >
          {{ part.text }} comes from the {{ part.layer }} layer.
          {{ part.cross ? 'The admin layer is not allowed to use it.' : '' }}
        </li>
      </ul>
    </figcaption>
  </figure>
</template>
