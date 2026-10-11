import type { UseStatus } from '#src/why/index.ts';

/** The words for a use status. This file has no imports at run time, so the DevTools client can bundle it. */
export const STATUS_LABELS: Record<UseStatus, string> = {
  'same-layer': '✔ same layer',
  external: '✔ external',
  unrestricted: '✔ unrestricted',
  allowed: '✔ allowed',
  'not-allowed': '✖ not allowed',
  'not-exposed': '✖ not exposed',
};
