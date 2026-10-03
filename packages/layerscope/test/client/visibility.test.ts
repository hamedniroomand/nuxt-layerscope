import { describe, expect, it } from 'vite-plus/test';

import type { FrameElement, FrameWindow } from '#src/devtools/client/lib/visibility.ts';
import { frameChain, isVisible } from '#src/devtools/client/lib/visibility.ts';

interface FakeFrame extends FrameElement {
  shown: boolean;
}

function frame(): FakeFrame {
  const fake: FakeFrame = {
    shown: true,
    checkVisibility: () => fake.shown,
    getRootNode: () => ({}) as Node,
  };
  return fake;
}

function fakeWindow(frameElement: FrameElement | null, parent?: FrameWindow): FrameWindow {
  const win = {
    document: {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    },
    frameElement,
  } as unknown as FrameWindow & { parent: FrameWindow };
  win.parent = parent ?? win;
  return win;
}

/** The tab's iframe inside the DevTools frame inside the app page. */
function chain(): {
  tab: FrameWindow;
  tabFrame: FakeFrame;
  panelFrame: FakeFrame;
  app: FrameWindow;
} {
  const app = fakeWindow(null);
  const panelFrame = frame();
  const devtools = fakeWindow(panelFrame, app);
  const tabFrame = frame();
  return { tab: fakeWindow(tabFrame, devtools), tabFrame, panelFrame, app };
}

describe('tab visibility', () => {
  it('walks the frame chain up to the top window', () => {
    const { tab, tabFrame, panelFrame } = chain();
    const { frames, windows } = frameChain(tab);
    expect(frames).toEqual([tabFrame, panelFrame]);
    expect(windows).toHaveLength(3);
  });

  it('is hidden when the tab frame, the panel or a document is hidden', () => {
    const { tab, tabFrame, panelFrame, app } = chain();
    expect(isVisible(tab)).toBe(true);
    tabFrame.shown = false;
    expect(isVisible(tab)).toBe(false);
    tabFrame.shown = true;
    panelFrame.shown = false;
    expect(isVisible(tab)).toBe(false);
    panelFrame.shown = true;
    (app.document as { visibilityState: string }).visibilityState = 'hidden';
    expect(isVisible(tab)).toBe(false);
  });

  it('stops at a frame it may not read', () => {
    const top = fakeWindow(null);
    const blocked = {
      ...fakeWindow(null, top),
      get frameElement(): FrameElement {
        throw new Error('cross-origin');
      },
    } as FrameWindow;
    const tab = fakeWindow(frame(), blocked);
    expect(frameChain(tab).frames).toHaveLength(1);
    expect(isVisible(tab)).toBe(true);
  });
});
