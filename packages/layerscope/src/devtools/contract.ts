/**
 * Everything the DevTools client can import from core. The client package reaches this file
 * through its `#contract` alias, and a boundary test blocks every other core import. Keep the
 * values pure: no Node built-ins and no server-only dependencies.
 */
export type * from './protocol.ts';
export type { FindingDelta } from './finding-keys.ts';
export type { LiveEvent, LiveState } from './live.ts';
export { STATIC_PATHS, edgePath, nodePath, traceUrl } from './static-paths.ts';
export type { Layout } from '#src/graph/layout.ts';
export { NODE_HEIGHT, NODE_WIDTH } from '#src/graph/layout-size.ts';
export type { UnusedRow } from '#src/report/unused.ts';
export type { WhyTargetRow, WhyUseRow } from '#src/report/why.ts';
export { STATUS_LABELS } from '#src/report/why-labels.ts';
export type { BaselineEntry } from '#src/types.ts';
