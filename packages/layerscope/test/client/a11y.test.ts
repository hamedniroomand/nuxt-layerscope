// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { edgeView, graphView } from '#src/devtools/graph-api.ts';
import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';
import { mountApp, press } from '#test/client/mount.ts';
import { makeEdge, makeFinding, makeResult } from '#test/factories.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

/** Every axe violation as "rule: first target", so a failure names what to fix. */
async function violations(): Promise<string[]> {
  // Contrast needs real layout and colors; the token contrast test covers it.
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map(
    violation => `${violation.id}: ${JSON.stringify(violation.nodes[0]?.target)}`,
  );
}

const hinted = {
  ...sampleFindings()[0],
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
    baselined: 0,
    snippet: 'layers: {}',
  },
};

async function open(
  hash: string,
  findings = sampleFindings(),
): Promise<Awaited<ReturnType<typeof mountApp>>> {
  window.location.hash = hash;
  const app = await mountApp(reportResponse({ findings }));
  mounted = app.wrapper;
  return app;
}

describe('accessibility audit', () => {
  it('reports a real problem, so a clean result means something', async () => {
    await open('#/overview');
    const image = document.createElement('img');
    image.src = 'x.png';
    document.body.append(image);
    expect(await violations()).toContainEqual(expect.stringContaining('image-alt'));
    image.remove();
  });
});

describe('accessibility of each view', () => {
  it('overview', async () => {
    await open('#/overview');
    expect(await violations()).toEqual([]);
  });

  it('findings with a hint, an inline confirm and picked rows', async () => {
    await open('#/findings', [
      hinted as typeof hinted & ReturnType<typeof sampleFindings>[number],
      ...sampleFindings().slice(1),
    ]);
    press('j');
    press('x');
    press('i');
    await flushPromises();
    expect(await violations()).toEqual([]);
  });

  it('trace with results and an open autocomplete', async () => {
    const { wrapper, api } = await open('#/trace');
    vi.mocked(api.symbols).mockResolvedValue({
      symbols: [{ name: 'useCart', kind: 'auto-import', layer: 'web', contexts: ['app'] }],
    });
    const input = wrapper.get('input[role="combobox"]');
    await input.trigger('focus');
    await flushPromises();
    await input.setValue('use');
    expect(await violations()).toEqual([]);
  });
});

describe('accessibility of the data views', () => {
  it('unused and baseline', async () => {
    const { api } = await open('#/unused');
    vi.mocked(api.baseline).mockResolvedValue({
      file: 'b.json',
      suppressed: sampleFindings().slice(0, 1),
      removable: [],
    });
    expect(await violations()).toEqual([]);
    press('6');
    await flushPromises();
    expect(await violations()).toEqual([]);
  });

  it('graph with a selected edge, and the table', async () => {
    const result = makeResult({ edges: [makeEdge()], findings: [makeFinding()] });
    const { wrapper, api } = await open('#/overview');
    vi.mocked(api.graph).mockResolvedValue(await graphView(result));
    vi.mocked(api.edge).mockResolvedValue(edgeView(result, 'web', 'shop'));
    press('5');
    await vi.dynamicImportSettled();
    await flushPromises();
    await wrapper.get('.edge').trigger('click');
    await flushPromises();
    expect(await violations()).toEqual([]);
    const table = wrapper.findAll('.seg button').find(button => button.text() === 'Table');
    await table?.trigger('click');
    expect(await violations()).toEqual([]);
  });

  it('shortcut sheet', async () => {
    await open('#/findings');
    press('?');
    await flushPromises();
    expect(await violations()).toEqual([]);
  });
});
