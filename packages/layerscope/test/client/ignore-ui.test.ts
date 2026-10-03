// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';
import { mountApp, press } from '#test/client/mount.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '#/findings';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

async function mountFindings(): Promise<Awaited<ReturnType<typeof mountApp>>> {
  const app = await mountApp(reportResponse({ findings: sampleFindings() }));
  mounted = app.wrapper;
  vi.mocked(app.api.ignore).mockResolvedValue({ ...reportResponse({}, 1), writeId: 1 });
  vi.mocked(app.api.undo).mockResolvedValue({
    ...reportResponse({ findings: sampleFindings() }, 2),
    writeId: 1,
  });
  return app;
}

describe('ignore from the findings list', () => {
  it('asks inline, writes on Add and offers Undo in the toast', async () => {
    const { wrapper, api } = await mountFindings();
    const ignore = wrapper.findAll('li.row button').find(button => button.text() === 'Ignore');
    await ignore?.trigger('click');
    const confirm = wrapper.get('[role="alertdialog"]');
    expect(confirm.text()).toContain('Add 1 entry for 1 finding in 1 file');
    await confirm.get('button').trigger('click');
    await flushPromises();
    expect(api.ignore).toHaveBeenCalledWith({ id: 'a', rev: 0 }, [sampleFindings()[0]?.key]);
    expect(wrapper.findAll('li.row')).toHaveLength(0);
    const undo = wrapper.findAll('button').find(button => button.text() === 'Undo');
    await undo?.trigger('click');
    await flushPromises();
    expect(api.undo).toHaveBeenCalledWith('a', 1);
    expect(wrapper.findAll('li.row')).toHaveLength(3);
  });

  it('opens the confirm with i, cancels with Esc, and ignores picked rows in bulk', async () => {
    const { wrapper, api } = await mountFindings();
    press('j');
    press('i');
    await flushPromises();
    const confirm = wrapper.get('[role="alertdialog"]');
    await confirm.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    press('x');
    press('j');
    press('x');
    await flushPromises();
    expect(wrapper.get('.bulk').text()).toContain('2 picked');
    const bulk = wrapper.findAll('.bulk button').find(button => button.text() === 'Ignore picked');
    await bulk?.trigger('click');
    expect(wrapper.get('[role="alertdialog"]').text()).toContain(
      'Add 2 entries for 2 findings in 2 files',
    );
    await wrapper.get('[role="alertdialog"] button').trigger('click');
    await flushPromises();
    expect(vi.mocked(api.ignore).mock.lastCall?.[1]).toHaveLength(2);
  });

  it('ignores a whole group from its header', async () => {
    const { wrapper } = await mountFindings();
    const all = wrapper.findAll('h3.group button').find(button => button.text() === 'Ignore all 2');
    await all?.trigger('click');
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('Add 2 entries for 2 findings');
  });
});

describe('baseline view actions', () => {
  it('removes a suppressed finding after a confirm', async () => {
    window.location.hash = '#/baseline';
    const { wrapper, api } = await mountFindings();
    vi.mocked(api.baseline).mockResolvedValue({
      file: 'layerscope-baseline.json',
      suppressed: sampleFindings().slice(0, 1),
      removable: [],
    });
    vi.mocked(api.remove).mockResolvedValue({ ...reportResponse({}, 3), writeId: 2 });
    press('1');
    await flushPromises();
    press('6');
    await flushPromises();
    const remove = wrapper
      .findAll('button')
      .find(button => button.text() === 'Remove from baseline');
    await remove?.trigger('click');
    await wrapper.get('[role="alertdialog"] button').trigger('click');
    await flushPromises();
    expect(api.remove).toHaveBeenCalledWith({ id: 'a', rev: 0 }, [sampleFindings()[0]?.key]);
    expect(wrapper.text()).toContain('The last change to the baseline can be undone.');
  });
});
