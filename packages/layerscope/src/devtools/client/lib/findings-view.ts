import type { ComputedRef, Ref } from 'vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type { TabFinding } from '#src/devtools/protocol.ts';

import type { TabContext } from './context.ts';
import type { ChipCount, FindingGroup } from './filters.ts';
import { countBy, filterFindings, groupFindings, toggle } from './filters.ts';
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
  selected: Ref<number>;
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

/** Filters, groups and keyboard selection of the Findings view. */
export function useFindingsView(context: TabContext): FindingsView {
  const { nav, store, api } = context;
  const query = computed(() => nav.route.value.query);
  const findings = computed(() => store.state.data?.report.findings ?? []);
  const filtered = computed(() => filterFindings(findings.value, query.value));
  const groups = computed(() => groupFindings(filtered.value, query.value.group));
  const rows = computed(() => groups.value.flatMap(group => group.findings));
  const selected = ref(-1);
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
    selected,
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
    move: step => {
      const last = rows.value.length - 1;
      selected.value = Math.min(Math.max(selected.value + step, 0), last);
    },
    openSelected: async () => {
      const finding = selected.value < 0 ? undefined : rows.value.at(selected.value);
      if (finding !== undefined) {
        await open(finding.absFile, finding.line, finding.column);
      }
    },
    open,
  };
}
