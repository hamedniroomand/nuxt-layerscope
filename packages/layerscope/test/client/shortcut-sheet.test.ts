// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { sheetRows } from '#src/devtools/client/lib/shortcuts.ts';
import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';
import { mountApp, press } from '#test/client/mount.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '#/findings';
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

describe('shortcut sheet', () => {
  it('lists one row per key, with readable names', () => {
    const run = (): undefined => undefined;
    expect(
      sheetRows([
        { key: 'j', label: 'old', run },
        { key: 'Escape', label: 'Clear', run },
        { key: 'j', label: 'Next finding', run },
      ]),
    ).toEqual([
      { key: 'Esc', label: 'Clear' },
      { key: 'j', label: 'Next finding' },
    ]);
  });

  it('opens with ?, lists the keys in use, traps focus and gives it back on Esc', async () => {
    const { wrapper } = await mountApp(reportResponse({ findings: sampleFindings() }));
    mounted = wrapper;
    const opener = wrapper.get('button[aria-label="Keyboard shortcuts"]');
    (opener.element as HTMLElement).focus();
    press('?');
    await flushPromises();
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain('Ignore the selected finding');
    expect(dialog.text()).toContain('Next finding');
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
    await dialog.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
    await dialog.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(opener.element);
  });
});
