import type { ComputedRef } from 'vue';
import { computed, shallowRef } from 'vue';

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const WHEEL_STEP = 0.0015;

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface PanZoom {
  /** The `transform` of the graph's group. */
  transform: ComputedRef<string>;
  zoom: (factor: number) => void;
  fit: () => void;
  onWheel: (event: WheelEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
}

function clamp(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Zoom by `factor` around the point (px, py), so that point stays where it is. */
export function zoomAround(view: Viewport, factor: number, px: number, py: number): Viewport {
  const scale = clamp(view.scale * factor);
  const applied = scale / view.scale;
  return { scale, x: px - (px - view.x) * applied, y: py - (py - view.y) * applied };
}

interface FrameQueue {
  push: (next: Viewport) => void;
  pending: () => Viewport | undefined;
  clear: () => void;
}

/** Keeps the latest viewport and applies it once per animation frame. */
function createFrameQueue(apply: (next: Viewport) => void): FrameQueue {
  let pending: Viewport | undefined;
  return {
    push: next => {
      if (pending === undefined) {
        requestAnimationFrame(() => {
          if (pending !== undefined) {
            apply(pending);
            pending = undefined;
          }
        });
      }
      pending = next;
    },
    pending: () => pending,
    clear: () => {
      pending = undefined;
    },
  };
}

/**
 * Pan and zoom as one transform; pointer and wheel events are coalesced to one update per frame,
 * so a fast wheel never queues layout work.
 */
export function usePanZoom(): PanZoom {
  const view = shallowRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const frame = createFrameQueue(next => {
    view.value = next;
  });
  let drag: { x: number; y: number; start: Viewport } | undefined;
  const schedule = frame.push;
  const current = (): Viewport => frame.pending() ?? view.value;
  return {
    transform: computed(
      () => `translate(${view.value.x} ${view.value.y}) scale(${view.value.scale})`,
    ),
    zoom: factor => {
      schedule({ ...current(), scale: clamp(current().scale * factor) });
    },
    fit: () => {
      frame.clear();
      view.value = { x: 0, y: 0, scale: 1 };
    },
    onWheel: event => {
      event.preventDefault();
      const box = (event.currentTarget as Element).getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * WHEEL_STEP);
      schedule(zoomAround(current(), factor, event.clientX - box.left, event.clientY - box.top));
    },
    onPointerDown: event => {
      // Nodes and edges handle their own clicks; panning starts on the background only.
      if ((event.target as Element).closest('.node, .edge') !== null) {
        return;
      }
      drag = { x: event.clientX, y: event.clientY, start: current() };
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    },
    onPointerMove: event => {
      if (drag !== undefined) {
        const { start } = drag;
        schedule({
          ...start,
          x: start.x + event.clientX - drag.x,
          y: start.y + event.clientY - drag.y,
        });
      }
    },
    onPointerUp: () => {
      drag = undefined;
    },
  };
}
