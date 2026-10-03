import type { TraceView, UnusedView } from '#src/devtools/protocol.ts';
import type { UnusedRow } from '#src/report/unused.ts';
import type { WhyTargetRow, WhyUseRow } from '#src/report/why.ts';

export interface TraceUse extends WhyUseRow {
  /** What the symbol resolved to for this use. */
  target: WhyTargetRow;
}

export interface TraceGroup {
  /** The layer the uses are in. */
  layer: string;
  /** Worst status in the group. */
  status: WhyUseRow['status'];
  uses: TraceUse[];
}

// Worst first: a group takes the status of its worst use and not-allowed groups sort first.
const STATUS_ORDER: WhyUseRow['status'][] = [
  'not-allowed',
  'allowed',
  'unrestricted',
  'same-layer',
  'external',
];

function rank(status: WhyUseRow['status']): number {
  return STATUS_ORDER.indexOf(status);
}

/** Uses grouped by the layer they are in; groups with a not-allowed use come first. */
export function traceGroups(view: TraceView): TraceGroup[] {
  const groups = new Map<string, TraceGroup>();
  for (const target of view.targets) {
    for (const use of target.uses) {
      const group = groups.get(use.fromLayer) ?? {
        layer: use.fromLayer,
        status: use.status,
        uses: [],
      };
      group.uses.push({ ...use, target });
      if (rank(use.status) < rank(group.status)) {
        group.status = use.status;
      }
      groups.set(use.fromLayer, group);
    }
  }
  return [...groups.values()].toSorted((a, b) => rank(a.status) - rank(b.status));
}

export interface UnusedGroup {
  layer: string;
  rows: UnusedRow[];
}

/** Unused symbols grouped by layer, in the project's layer order. */
export function unusedGroups(view: UnusedView): UnusedGroup[] {
  const order = new Map(view.layers.map((layer, index) => [layer, index]));
  const groups = new Map<string, UnusedGroup>();
  for (const row of view.unused) {
    const group = groups.get(row.layer) ?? { layer: row.layer, rows: [] };
    group.rows.push(row);
    groups.set(row.layer, group);
  }
  return [...groups.values()].toSorted(
    (a, b) => (order.get(a.layer) ?? 0) - (order.get(b.layer) ?? 0),
  );
}

export function useCount(view: TraceView): number {
  return view.targets.reduce((sum, target) => sum + target.uses.length, 0);
}
