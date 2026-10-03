// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { usePanZoom } from '#src/devtools/client/lib/pan-zoom.ts';

let frames: (() => void)[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (step: () => void) => frames.push(step));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushFrames(): void {
  const run = frames;
  frames = [];
  for (const step of run) {
    step();
  }
}

/** The canvas: at (10, 20) on the page, with a background and one node inside. */
function canvas(): {
  svg: Element;
  background: Element;
  node: Element;
  capture: ReturnType<typeof vi.fn<(id: number) => void>>;
} {
  const svg = document.createElement('div');
  svg.getBoundingClientRect = (): DOMRect => ({ left: 10, top: 20 }) as DOMRect;
  const capture = vi.fn<(id: number) => void>();
  svg.setPointerCapture = capture;
  const background = document.createElement('span');
  const node = document.createElement('span');
  const group = document.createElement('div');
  group.className = 'node';
  group.append(node);
  svg.append(background, group);
  return { svg, background, node, capture };
}

function wheel(
  target: Element,
  deltaY: number,
  x: number,
  y: number,
  preventDefault = vi.fn<() => void>(),
): WheelEvent {
  return { currentTarget: target, deltaY, clientX: x, clientY: y, preventDefault } as never;
}

function pointer(currentTarget: Element, target: Element, x: number, y: number): PointerEvent {
  return { currentTarget, target, clientX: x, clientY: y, pointerId: 1 } as never;
}

describe('pan and zoom by wheel and buttons', () => {
  it('zooms around the pointer and clamps at both ends', () => {
    const { svg } = canvas();
    const pan = usePanZoom();
    const preventDefault = vi.fn<() => void>();
    pan.onWheel(wheel(svg, -Math.log(2) / 0.0015, 110, 70, preventDefault));
    expect(preventDefault).toHaveBeenCalled();
    flushFrames();
    expect(pan.transform.value).toBe('translate(-100 -50) scale(2)');
    pan.onWheel(wheel(svg, -5000, 10, 20));
    flushFrames();
    expect(pan.transform.value).toMatch(/scale\(3\)$/u);
    pan.zoom(0.001);
    flushFrames();
    expect(pan.transform.value).toMatch(/scale\(0\.3\)$/u);
  });

  it('applies only the latest viewport in a frame, and fit drops a pending one', () => {
    const pan = usePanZoom();
    pan.zoom(2);
    pan.zoom(1.5);
    expect(frames).toHaveLength(1);
    flushFrames();
    expect(pan.transform.value).toBe('translate(0 0) scale(3)');
    pan.zoom(0.5);
    pan.fit();
    flushFrames();
    expect(pan.transform.value).toBe('translate(0 0) scale(1)');
  });
});

describe('pan by dragging', () => {
  it('drags from the background until the pointer is up', () => {
    const { svg, background, capture } = canvas();
    const pan = usePanZoom();
    pan.onPointerDown(pointer(svg, background, 100, 100));
    expect(capture).toHaveBeenCalledWith(1);
    pan.onPointerMove(pointer(svg, background, 130, 90));
    flushFrames();
    expect(pan.transform.value).toBe('translate(30 -10) scale(1)');
    pan.onPointerUp(pointer(svg, background, 130, 90));
    pan.onPointerMove(pointer(svg, background, 300, 300));
    flushFrames();
    expect(pan.transform.value).toBe('translate(30 -10) scale(1)');
  });

  it('does not drag when the pointer starts on a node or an edge', () => {
    const { svg, node, capture } = canvas();
    const pan = usePanZoom();
    pan.onPointerDown(pointer(svg, node, 100, 100));
    pan.onPointerMove(pointer(svg, node, 150, 150));
    flushFrames();
    expect(capture).not.toHaveBeenCalled();
    expect(pan.transform.value).toBe('translate(0 0) scale(1)');
  });
});
