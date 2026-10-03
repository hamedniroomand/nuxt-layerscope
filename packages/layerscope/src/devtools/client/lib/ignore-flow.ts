import type { ShallowRef } from 'vue';
import { onBeforeUnmount, shallowRef } from 'vue';

import type { TabFinding } from '#src/devtools/protocol.ts';

import type { TabContext } from './context.ts';
import type { FindingsView } from './findings-view.ts';
import { plural } from './format.ts';
import type { MultiSelection } from './selection.ts';
import { createMultiSelection } from './selection.ts';

export interface IgnorePlan {
  keys: string[];
  /** "Add 2 entries for 3 findings in 2 files to layerscope-baseline.json?" */
  message: string;
}

/** What ignoring these findings writes: one entry per key, counting every finding with it. */
export function planIgnore(all: TabFinding[], picked: TabFinding[]): IgnorePlan {
  const keys = [...new Set(picked.map(finding => finding.key))];
  const wanted = new Set(keys);
  const covered = all.filter(finding => wanted.has(finding.key));
  const files = new Set(covered.map(finding => finding.file)).size;
  const message = `Add ${plural(keys.length, 'entry', 'entries')} for ${plural(covered.length, 'finding')} in ${plural(files, 'file')} to layerscope-baseline.json?`;
  return { keys, message };
}

export interface IgnoreFlow {
  multi: MultiSelection;
  pending: ShallowRef<IgnorePlan | null>;
  /** Asks before ignoring these findings. */
  ask: (findings: TabFinding[]) => void;
  /** Asks before ignoring the rows picked for a bulk action. */
  askPicked: () => void;
  confirm: () => Promise<void>;
  cancel: () => void;
}

/** `i` asks to ignore the selected finding; `x` picks it for a bulk action. */
function registerKeys(
  context: TabContext,
  view: FindingsView,
  ask: (findings: TabFinding[]) => void,
  multi: MultiSelection,
): void {
  const removers = [
    context.shortcuts.register({
      key: 'i',
      label: 'Ignore the selected finding',
      run: () => {
        const finding = view.current();
        if (finding !== undefined) {
          ask([finding]);
        }
      },
    }),
    context.shortcuts.register({
      key: 'x',
      label: 'Pick the selected finding for a bulk action',
      run: () => {
        const finding = view.current();
        if (finding !== undefined) {
          multi.toggle(view.idOf(finding));
        }
      },
    }),
  ];
  onBeforeUnmount(() => {
    for (const remove of removers) {
      remove();
    }
  });
}

/** Ignore one row, a group or a bulk pick, always after an inline confirm. */
export function useIgnoreFlow(context: TabContext, view: FindingsView): IgnoreFlow {
  const pending = shallowRef<IgnorePlan | null>(null);
  const multi = createMultiSelection(() => view.rows.value.map(row => view.idOf(row)));
  const all = (): TabFinding[] => context.store.state.data?.report.findings ?? [];
  const ask = (findings: TabFinding[]): void => {
    pending.value = findings.length === 0 ? null : planIgnore(all(), findings);
  };
  const askPicked = (): void => {
    ask(view.rows.value.filter(row => multi.has(view.idOf(row))));
  };
  registerKeys(context, view, ask, multi);
  return {
    multi,
    pending,
    ask,
    askPicked,
    confirm: async () => {
      const plan = pending.value;
      pending.value = null;
      if (plan !== null && (await context.actions.ignore(plan.keys))) {
        multi.clear();
      }
    },
    cancel: () => {
      pending.value = null;
    },
  };
}
