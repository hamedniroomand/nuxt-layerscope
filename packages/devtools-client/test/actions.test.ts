import { describe, expect, it, vi } from 'vite-plus/test';
import { ref } from 'vue';

import type { Toast } from '#client/lib/actions.ts';
import { createActions } from '#client/lib/actions.ts';
import { ApiError } from '#client/lib/api.ts';
import { planIgnore } from '#client/lib/ignore-flow.ts';
import { createMultiSelection } from '#client/lib/selection.ts';
import { createStore } from '#client/lib/store.ts';
import { reportResponse, sampleFindings } from '#test/fixtures.ts';
import { fakeApi } from '#test/mount.ts';

describe('ignore plan and picks', () => {
  it('counts entries, findings and files before writing', () => {
    const [cart, badge, button] = sampleFindings();
    const twin = { ...cart, line: 9 };
    const all = [cart, badge, button, twin];
    expect(planIgnore(all, [cart, twin]).message).toBe(
      'Add 1 entry for 2 findings in 1 file to the baseline file?',
    );
    expect(planIgnore(all, all).keys).toHaveLength(3);
  });

  it('picks rows one by one and as a range', () => {
    const picks = createMultiSelection(() => ['a', 'b', 'c', 'd']);
    picks.toggle('a');
    picks.toggle('c', true);
    expect([...picks.ids.value]).toEqual(['a', 'b', 'c']);
    picks.toggle('b');
    expect(picks.has('b')).toBe(false);
    picks.clear();
    expect(picks.count.value).toBe(0);
  });
});

describe('baseline actions', () => {
  it('takes the report from a write, offers undo, and undoes it', async () => {
    const api = fakeApi(reportResponse());
    const store = createStore(api);
    const toast = ref<Toast | null>(null);
    vi.mocked(api.ignore).mockResolvedValue({ ...reportResponse({}, 1), writeId: 4 });
    vi.mocked(api.undo).mockResolvedValue({ ...reportResponse({}, 2), writeId: 4 });
    const actions = createActions(api, store, toast);
    expect(await actions.ignore(['k'])).toBe(true);
    expect(store.state.data?.rev).toBe(1);
    expect(toast.value).toMatchObject({ undo: 4 });
    expect(toast.value?.message).toContain('Commit the file');
    await actions.undo();
    expect(api.undo).toHaveBeenCalledWith('a', 4);
    expect(actions.lastWrite.value).toBeNull();
    expect(store.state.data?.rev).toBe(2);
  });

  it('reloads after a stale revision and explains a refusal', async () => {
    const api = fakeApi(reportResponse());
    const store = createStore(api);
    const toast = ref<Toast | null>(null);
    const actions = createActions(api, store, toast);
    vi.mocked(api.ignore).mockRejectedValueOnce(new ApiError(409, 'stale'));
    expect(await actions.ignore(['k'])).toBe(false);
    expect(api.report).toHaveBeenCalled();
    expect(toast.value?.message).toBe('The findings changed. Review them and try again.');
    vi.mocked(api.remove).mockRejectedValueOnce(new ApiError(403, 'no'));
    await actions.remove(['k']);
    expect(toast.value?.message).toBe('Refused: the request did not come from this tab.');
    await actions.undo();
    expect(api.undo).not.toHaveBeenCalled();
  });
});
