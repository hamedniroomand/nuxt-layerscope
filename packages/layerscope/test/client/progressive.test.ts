// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { defineComponent, h, nextTick, shallowRef } from 'vue';

import type { Progressive } from '#src/devtools/client/lib/progressive.ts';
import { ROWS_PER_FRAME, useProgressive } from '#src/devtools/client/lib/progressive.ts';
import { reportResponse, tabFinding } from '#test/client/fixtures.ts';
import { mountApp } from '#test/client/mount.ts';

/** A fake requestAnimationFrame: frames run when the test says so. */
function frames(): { request: (step: () => void) => number; run: () => void; cancel: () => void } {
  let queue: (() => void)[] = [];
  return {
    request: step => queue.push(step),
    run: () => {
      const current = queue;
      queue = [];
      for (const step of current) {
        step();
      }
    },
    cancel: () => {
      queue = [];
    },
  };
}

function probe(
  total: () => number,
  identity: () => unknown,
  fake: ReturnType<typeof frames>,
): Progressive {
  let result: Progressive | undefined;
  mount(
    defineComponent({
      setup: () => {
        result = useProgressive(total, identity, fake.request, fake.cancel);
        return (): ReturnType<typeof h> => h('span');
      },
    }),
  );
  if (result === undefined) {
    throw new Error('not mounted');
  }
  return result;
}

describe('progressive rendering', () => {
  it('shows the first rows at once and grows one batch per frame', () => {
    const fake = frames();
    const list = probe(
      () => 450,
      () => 'all',
      fake,
    );
    expect(list.shown.value).toBe(ROWS_PER_FRAME);
    fake.run();
    expect(list.shown.value).toBe(400);
    fake.run();
    expect(list.shown.value).toBe(450);
    expect(list.complete.value).toBe(true);
  });

  it('extends the window for a move beyond it', () => {
    const list = probe(
      () => 1000,
      () => 'all',
      frames(),
    );
    list.reveal(640);
    expect(list.shown.value).toBe(641);
  });

  it('keeps what is shown for a new count and starts from the top for a new filter', async () => {
    const fake = frames();
    const total = shallowRef(1000);
    const filter = shallowRef('a');
    const list = probe(
      () => total.value,
      () => filter.value,
      fake,
    );
    fake.run();
    fake.run();
    expect(list.shown.value).toBe(600);
    total.value = 999;
    await nextTick();
    expect(list.shown.value).toBe(600);
    filter.value = 'b';
    await nextTick();
    expect(list.shown.value).toBe(ROWS_PER_FRAME);
  });
});

let mounted: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  window.location.hash = '#/findings';
});

afterEach(() => {
  mounted?.unmount();
  vi.unstubAllGlobals();
});

describe('a long findings list', () => {
  it('renders the first 200 of 1000 rows at once, and the rest on later frames', async () => {
    const fake = frames();
    vi.stubGlobal('requestAnimationFrame', fake.request);
    vi.stubGlobal('cancelAnimationFrame', fake.cancel);
    const findings = Array.from({ length: 1000 }, (_, index) =>
      tabFinding({ symbol: `use${index}`, line: index + 1 }),
    );
    const { wrapper } = await mountApp(reportResponse({ findings }));
    mounted = wrapper;
    expect(wrapper.findAll('li.row')).toHaveLength(200);
    for (let frame = 0; frame < 4; frame += 1) {
      fake.run();
    }
    await flushPromises();
    expect(wrapper.findAll('li.row')).toHaveLength(1000);
    expect(wrapper.get('h3.group').text()).toContain('1000');
  });
});
