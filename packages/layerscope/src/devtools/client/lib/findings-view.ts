import type { ComputedRef, Ref } from 'vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type { TabFinding } from '#src/devtools/protocol.ts';

import type { TabContext } from './context.ts';
import type { ChipCount, FindingGroup } from './filters.ts';
import { countBy, filterFindings, groupFindings, rowIds, toggle } from './filters.ts';
import type { FindingsQuery } from './router.ts';
import { isGroup } from './router.ts';

const TEXT_DELAY = 150;

export interface FindingsView {
  query: ComputedRef<FindingsQuery>;
  groups: ComputedRef<FindingGroup[]>;
  /** Rows in display order, for keyboard selection. */
  rows: ComputedRef<TabFinding[]>;
  severities: ComputedRef<ChipCount[]>;
  rules: ComputedRef<ChipCount[]>;
  total: ComputedRef<number>;
  text: Ref<string>;
  /** Id of the selected row; ids survive updates, so the selection stays on its finding. */
  selected: Ref<string | null>;
  idOf: (finding: TabFinding) => string;
  select: (finding: TabFinding) => void;
  /** Selects the next new finding after the selection, from the top after the last. */
  nextNew: () => void;
  /** The selected finding, when it is in the list. */
  current: () => TabFinding | undefined;
  update: (patch: Partial<FindingsQuery>) => void;
  setGroup: (value: string) => void;
  toggleSev: (value: string) => void;
  toggleRule: (value: string) => void;
  move: (step: number) => void;
  openSelected: () => Promise<void>;
  open: (file: string, line: number, column: number) => Promise<void>;
}

function useText(
  context: TabContext,
  update: (patch: Partial<FindingsQuery>) => void,
): Ref<string> {
  const text = ref(context.nav.route.value.query.q);
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(text, value => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      update({ q: value });
    }, TEXT_DELAY);
  });
  // A hash change from elsewhere (back button, a count link) wins over the field.
  watch(
    () => context.nav.route.value.query.q,
    value => {
      if (value !== text.value) {
        text.value = value;
      }
    },
  );
  onBeforeUnmount(() => {
    clearTimeout(timer);
  });
  return text;
}

interface Selection {
  selected: Ref<string | null>;
  select: (finding: TabFinding) => void;
  move: (step: number) => void;
  nextNew: () => void;
  current: () => TabFinding | undefined;
}

/** Keyboard selection by row id, so it stays on its finding while the list updates. */
function useSelection(
  rows: ComputedRef<TabFinding[]>,
  idOf: (finding: TabFinding) => string,
): Selection {
  const selected = ref<string | null>(null);
  const position = (): number => rows.value.findIndex(row => idOf(row) === selected.value);
  const pick = (row: TabFinding | undefined): void => {
    if (row !== undefined) {
      selected.value = idOf(row);
    }
  };
  return {
    selected,
    select: pick,
    move: step => {
      pick(rows.value.at(Math.min(Math.max(position() + step, 0), rows.value.length - 1)));
    },
    nextNew: () => {
      const start = position();
      const order = [...rows.value.slice(start + 1), ...rows.value.slice(0, start + 1)];
      pick(order.find(row => row.isNew));
    },
    current: () => {
      const index = position();
      return index < 0 ? undefined : rows.value.at(index);
    },
  };
}

/** Filters, groups and keyboard selection of the Findings view. */
export function useFindingsView(context: TabContext): FindingsView {
  const { nav, store, api } = context;
  const query = computed(() => nav.route.value.query);
  const findings = computed(() => store.state.data?.report.findings ?? []);
  const filtered = computed(() => filterFindings(findings.value, query.value));
  const groups = computed(() => groupFindings(filtered.value, query.value.group));
  const rows = computed(() => groups.value.flatMap(group => group.findings));
  const ids = computed(() => rowIds(findings.value));
  const idOf = (finding: TabFinding): string => ids.value.get(finding) ?? '';
  const selection = useSelection(rows, idOf);
  const update = (patch: Partial<FindingsQuery>): void => {
    nav.go({ view: 'findings', query: { ...query.value, ...patch } });
  };
  const open = async (file: string, line: number, column: number): Promise<void> => {
    await api.openInEditor(file, line, column);
  };
  return {
    query,
    groups,
    rows,
    severities: computed(() => countBy(findings.value, finding => finding.severity)),
    rules: computed(() => countBy(findings.value, finding => finding.rule)),
    total: computed(() => findings.value.length),
    text: useText(context, update),
    ...selection,
    idOf,
    update,
    setGroup: value => {
      if (isGroup(value)) {
        update({ group: value });
      }
    },
    toggleSev: value => {
      update({ sev: toggle(query.value.sev, value) });
    },
    toggleRule: value => {
      update({ rule: toggle(query.value.rule, value) });
    },
    openSelected: async () => {
      const finding = selection.current();
      if (finding !== undefined) {
        await open(finding.absFile, finding.line, finding.column);
      }
    },
    open,
  };
}
