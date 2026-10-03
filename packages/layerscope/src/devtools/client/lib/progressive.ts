import type { ComputedRef, ShallowRef } from 'vue';
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';

/** Rows rendered per animation frame; small enough that no frame becomes a long task. */
export const ROWS_PER_FRAME = 200;

export interface Progressive {
  /** How many rows are rendered now. */
  shown: ShallowRef<number>;
  /** Every row is rendered. */
  complete: ComputedRef<boolean>;
  /** Renders at least up to `index`, for a keyboard move beyond the rendered rows. */
  reveal: (index: number) => void;
}

/**
 * Renders a long list a frame at a time: the first rows at once, then more on each animation
 * frame until all are shown. The list itself is complete; only its rendering grows.
 */
export function useProgressive(
  total: () => number,
  /** Changes when the list is a different one (a new filter): rendering starts from the top. */
  identity: () => unknown,
  frame: (step: () => void) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
): Progressive {
  const shown = shallowRef(Math.min(ROWS_PER_FRAME, total()));
  let pending: number | undefined;
  const grow = (): void => {
    pending = undefined;
    shown.value = Math.min(total(), shown.value + ROWS_PER_FRAME);
    if (shown.value < total()) {
      pending = frame(grow);
    }
  };
  const restart = (from: number): void => {
    if (pending !== undefined) {
      cancel(pending);
      pending = undefined;
    }
    shown.value = Math.min(total(), Math.max(from, ROWS_PER_FRAME));
    if (shown.value < total()) {
      pending = frame(grow);
    }
  };
  // The same list with a new count (a live update) keeps what is shown, so nothing jumps.
  watch(total, () => {
    restart(shown.value);
  });
  // A different list starts from the top, so it never renders all at once.
  watch(identity, () => {
    restart(0);
  });
  restart(0);
  onBeforeUnmount(() => {
    if (pending !== undefined) {
      cancel(pending);
    }
  });
  return {
    shown,
    complete: computed(() => shown.value >= total()),
    reveal: index => {
      shown.value = Math.max(shown.value, Math.min(total(), index + 1));
    },
  };
}
