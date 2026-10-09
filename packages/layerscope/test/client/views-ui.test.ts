// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { TraceView } from '#src/devtools/protocol.ts';
import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';
import { mountApp, press } from '#test/client/mount.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.unstubAllGlobals();
});

const trace = {
  version: 1,
  symbol: 'useCart',
  targets: [
    {
      symbol: 'useCart',
      file: 'layers/web/useCart.ts',
      layer: 'web',
      external: null,
      uses: [
        {
          file: 'web/Cart.vue',
          absFile: '/app/web/Cart.vue',
          line: 3,
          column: 1,
          kind: 'auto-import',
          symbol: 'useCart',
          fromLayer: 'web',
          toLayer: 'web',
          status: 'same-layer',
        },
        {
          file: 'admin/Panel.vue',
          absFile: '/app/admin/Panel.vue',
          line: 2,
          column: 4,
          kind: 'auto-import',
          symbol: 'useCart',
          fromLayer: 'admin',
          toLayer: 'web',
          status: 'not-allowed',
        },
      ],
    },
  ],
} as TraceView;

describe('trace view', () => {
  it('traces the symbol in the hash when the view opens', async () => {
    window.location.hash = '#/trace/useCart';
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    expect(api.trace).toHaveBeenCalledWith('useCart');
    expect(wrapper.text()).toContain('No uses of "useCart" found.');
  });

  it('suggests symbols after the first focus and traces the picked one', async () => {
    window.location.hash = '#/trace';
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    vi.mocked(api.symbols).mockResolvedValue({
      symbols: [{ name: 'useCart', kind: 'auto-import', layer: 'web', contexts: ['app'] }],
    });
    vi.mocked(api.trace).mockResolvedValue(trace);
    const input = wrapper.get('input[role="combobox"]');
    await input.trigger('focus');
    await flushPromises();
    await input.trigger('focus');
    expect(api.symbols).toHaveBeenCalledOnce();
    await input.setValue('usec');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(window.location.hash).toBe('#/trace/useCart');
    expect(api.trace).toHaveBeenLastCalledWith('useCart');
    const groups = wrapper.findAll('h3.group');
    expect(groups[0]?.text()).toContain('admin (✖ not allowed)');
    await wrapper.find('.uses a').trigger('click');
    expect(api.openInEditor).toHaveBeenCalledWith('/app/admin/Panel.vue', 2, 4);
  });
});

describe('unused view', () => {
  it('groups unused symbols, warns about runtime components and traces a row', async () => {
    window.location.hash = '#/unused';
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    vi.mocked(api.unused).mockResolvedValue({
      unused: [
        {
          name: 'BaseCard',
          kind: 'component',
          context: null,
          file: 'ui/BaseCard.vue',
          absFile: '/app/ui/BaseCard.vue',
          layer: 'ui',
          exposed: false,
          possiblyUsed: true,
        },
      ],
      possiblyUsed: true,
      layers: ['ui'],
    });
    // Leave and come back, so the view mounts again and fetches.
    press('6');
    await flushPromises();
    press('4');
    await flushPromises();
    expect(wrapper.text()).toContain('a component listed here may still be used');
    expect(wrapper.get('h3.group').text()).toContain('ui');
    await wrapper.get('.rows button').trigger('click');
    expect(window.location.hash).toBe('#/trace/BaseCard');
  });
});

describe('baseline view', () => {
  it('shows suppressed and removable baseline entries', async () => {
    window.location.hash = '#/baseline';
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    expect(wrapper.text()).toContain('No baseline file');
    vi.mocked(api.baseline).mockResolvedValue({
      file: 'layerscope-baseline.json',
      suppressed: sampleFindings().slice(0, 1),
      removable: [
        { rule: 'layer-boundary', file: 'gone.vue', symbol: 'x', toLayer: null, count: 2 },
      ],
    });
    press('1');
    await flushPromises();
    press('6');
    await flushPromises();
    const headings = wrapper.findAll('h3.group').map(heading => heading.text());
    expect(headings).toEqual(['Suppressed findings1', 'Removable entries1']);
    expect(wrapper.text()).toContain('×2');
  });
});

describe('finding hints and actions', () => {
  it('shows the suggestion and the allow snippet, traces with t and copies by hand when refused', async () => {
    window.location.hash = '#/findings';
    const [first, ...rest] = sampleFindings();
    const hinted = {
      ...first,
      suggestion: {
        action: 'allow' as const,
        message: 'allow "web" to use "shop"',
        impact: { fixes: 2 },
      },
      hint: {
        kind: 'allow' as const,
        layer: 'web',
        add: 'shop',
        resolves: 2,
        files: 1,
        baselined: 1,
        snippet: "layers: {\n  web: { allow: ['shop'] },\n}",
      },
    };
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const { wrapper } = await mountApp(reportResponse({ findings: [hinted, ...rest] }));
    mounted = wrapper;
    press('j');
    await flushPromises();
    const hint = wrapper.get('.hint');
    expect(hint.text()).toContain(
      'Allow "web" to use "shop": resolves 2 findings in 1 file, 1 already in baseline',
    );
    // One sentence: the analyzer's own allow message is not repeated next to it.
    expect(hint.text()).not.toContain('allow "web" to use "shop"');
    await hint.get('button').trigger('click');
    await flushPromises();
    expect((hint.get('input').element as HTMLInputElement).value).toContain("allow: ['shop']");
    press('t');
    expect(window.location.hash).toBe('#/trace/useCart');
  });
});
