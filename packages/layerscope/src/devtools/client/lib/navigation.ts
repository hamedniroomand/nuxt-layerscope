import type { ShallowRef } from 'vue';
import { shallowRef } from 'vue';

import type { FindingsQuery, Route, View } from './router.ts';
import { emptyQuery, formatHash, parseHash } from './router.ts';

const STORAGE_KEY = 'layerscope:hash';

/** The slice of `window` navigation uses, so tests can pass a stub. */
export interface HashHost {
  location: { hash: string };
  history: Pick<History, 'replaceState'>;
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  addEventListener: (type: 'hashchange', listener: () => void) => void;
}

export interface Navigation {
  route: ShallowRef<Route>;
  go: (route: Route) => void;
  /** Opens a view; the Findings query stays unless `query` replaces parts of it. */
  open: (view: View, query?: Partial<FindingsQuery>) => void;
}

function storedHash(host: HashHost): string {
  try {
    return host.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function store(host: HashHost, hash: string): void {
  try {
    host.sessionStorage.setItem(STORAGE_KEY, hash);
  } catch {
    // Storage can be blocked in an iframe; the hash alone still works.
  }
}

/**
 * The route lives in the hash; the last hash survives a reload of a hash-less URL. The hash is
 * replaced, never pushed: the iframe shares session history with the host app, so pushed entries
 * would make the app's Back button walk through tab states.
 */
export function createNavigation(host: HashHost): Navigation {
  if (host.location.hash === '' || host.location.hash === '#') {
    const saved = storedHash(host);
    if (saved !== '') {
      host.history.replaceState(null, '', saved);
    }
  }
  const route = shallowRef(parseHash(host.location.hash));
  host.addEventListener('hashchange', () => {
    route.value = parseHash(host.location.hash);
    store(host, host.location.hash);
  });
  const go = (next: Route): void => {
    const hash = formatHash(next);
    route.value = parseHash(hash);
    store(host, hash);
    if (host.location.hash !== hash) {
      host.history.replaceState(null, '', hash);
    }
  };
  const open = (view: View, query?: Partial<FindingsQuery>): void => {
    const base = query === undefined ? route.value.query : { ...emptyQuery(), ...query };
    go({ view, query: base });
  };
  return { route, go, open };
}
