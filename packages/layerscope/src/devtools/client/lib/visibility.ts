/**
 * Nuxt DevTools keeps a custom tab's iframe after the first open: it sets `visibility: hidden` on
 * the iframe when another tab is selected, and hides the panel around the DevTools frame with
 * `display: none` when the panel closes. Every frame in the chain is same-origin, so the tab can
 * check each frame element itself.
 */

/** The slice of a frame element the check reads. */
export interface FrameElement {
  checkVisibility?: (options?: { visibilityProperty?: boolean }) => boolean;
  getRootNode: () => Node;
}

/** The slice of `window` the check reads, so tests can pass a fake chain. */
export interface FrameWindow {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  frameElement: FrameElement | null;
  parent: FrameWindow;
}

const WATCHED = ['style', 'class', 'hidden'];

/** The frame elements from this window up to the top; stops at a frame it may not read. */
export function frameChain(win: FrameWindow): { frames: FrameElement[]; windows: FrameWindow[] } {
  const frames: FrameElement[] = [];
  const windows: FrameWindow[] = [win];
  let current = win;
  for (;;) {
    let frame: FrameElement | null;
    try {
      frame = current.frameElement;
    } catch {
      break;
    }
    if (frame === null || current.parent === current) {
      break;
    }
    frames.push(frame);
    current = current.parent;
    windows.push(current);
  }
  return { frames, windows };
}

/** Visible when every document is visible and every frame element renders. */
export function isVisible(win: FrameWindow): boolean {
  const { frames, windows } = frameChain(win);
  return (
    windows.every(item => item.document.visibilityState !== 'hidden') &&
    frames.every(frame => frame.checkVisibility?.({ visibilityProperty: true }) ?? true)
  );
}

/** Calls `onChange` when the tab is shown or hidden; returns a function that stops watching. */
export function watchVisibility(
  win: FrameWindow,
  onChange: (visible: boolean) => void,
): () => void {
  let visible = isVisible(win);
  const check = (): void => {
    const next = isVisible(win);
    if (next !== visible) {
      visible = next;
      onChange(next);
    }
  };
  const { frames, windows } = frameChain(win);
  const observer = new MutationObserver(check);
  for (const frame of frames) {
    // The root holds the frame and the panel around it: a document or a shadow root.
    observer.observe(frame.getRootNode(), {
      attributes: true,
      attributeFilter: WATCHED,
      subtree: true,
    });
  }
  for (const item of windows) {
    item.document.addEventListener('visibilitychange', check);
  }
  return (): void => {
    observer.disconnect();
    for (const item of windows) {
      item.document.removeEventListener('visibilitychange', check);
    }
  };
}
