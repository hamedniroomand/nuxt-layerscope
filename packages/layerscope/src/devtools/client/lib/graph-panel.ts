import type { ShallowRef } from 'vue';
import { shallowRef, watch } from 'vue';

import type { EdgeView, NodeView } from '#src/devtools/protocol.ts';

import type { TabContext } from './context.ts';
import type { GraphSelection } from './graph-model.ts';

export interface PanelData {
  node: ShallowRef<NodeView | null>;
  edge: ShallowRef<EdgeView | null>;
  error: ShallowRef<string | null>;
  reload: () => Promise<void>;
  /** Appends the next page of the node's files. */
  more: () => Promise<void>;
}

/** Detail for the selected node or edge; fetched on selection and on each new revision. */
export function usePanel(context: TabContext, selection: () => GraphSelection): PanelData {
  const { api, store } = context;
  const node = shallowRef<NodeView | null>(null);
  const edge = shallowRef<EdgeView | null>(null);
  const error = shallowRef<string | null>(null);
  const reload = async (): Promise<void> => {
    const current = selection();
    error.value = null;
    try {
      node.value = current?.kind === 'node' ? await api.node(current.layer) : null;
      edge.value = current?.kind === 'edge' ? await api.edge(current.from, current.to) : null;
    } catch (caught) {
      error.value = (caught as Error).message;
    }
  };
  const more = async (): Promise<void> => {
    const { value } = node;
    if (value === null) {
      return;
    }
    const page = await api.node(value.layer.name, value.offset + value.files.length);
    node.value = { ...page, files: [...value.files, ...page.files], offset: value.offset };
  };
  watch(() => [JSON.stringify(selection()), store.state.data?.rev, store.state.data?.id], reload, {
    immediate: true,
  });
  return { node, edge, error, reload, more };
}
