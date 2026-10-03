export const VIEWS = ['overview', 'findings', 'trace', 'unused', 'baseline', 'layers'] as const;

export type View = (typeof VIEWS)[number];

export interface TabItem {
  view: View;
  label: string;
  badge?: number;
}

export type GroupBy = 'rule' | 'file' | 'pair' | 'none';

const GROUPS: readonly GroupBy[] = ['rule', 'file', 'pair', 'none'];

/** Filter state of the Findings view; every field maps to one hash parameter. */
export interface FindingsQuery {
  sev: string[];
  rule: string[];
  /** `from:to` layer pair. */
  pair: string | null;
  /** Relative file path. */
  file: string | null;
  q: string;
  group: GroupBy;
  /** Only findings new since the marker. */
  onlyNew: boolean;
}

export interface Route {
  view: View;
  query: FindingsQuery;
  /** The path part after the view, such as the symbol in `#/trace/useCart`. */
  param?: string;
}

export function emptyQuery(): FindingsQuery {
  return { sev: [], rule: [], pair: null, file: null, q: '', group: 'rule', onlyNew: false };
}

function isView(value: string): value is View {
  return (VIEWS as readonly string[]).includes(value);
}

export function isGroup(value: string): value is GroupBy {
  return (GROUPS as readonly string[]).includes(value);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function list(value: string | null): string[] {
  return value === null || value === '' ? [] : value.split(',');
}

/** `#/findings?sev=error&rule=layer-boundary` to a route; unknown parts fall back to defaults. */
export function parseHash(hash: string): Route {
  const [path = '', search = ''] = hash.replace(/^#\/?/u, '').split('?');
  const [name = '', ...rest] = path.split('/');
  const params = new URLSearchParams(search);
  const group = params.get('group') ?? 'rule';
  const param = safeDecode(rest.join('/'));
  return {
    view: isView(name) ? name : 'overview',
    ...(param !== '' && { param }),
    query: {
      sev: list(params.get('sev')),
      rule: list(params.get('rule')),
      pair: params.get('pair'),
      file: params.get('file'),
      q: params.get('q') ?? '',
      group: isGroup(group) ? group : 'rule',
      onlyNew: params.get('new') === '1',
    },
  };
}

/** The inverse of `parseHash`; default values are left out to keep the hash short. */
export function formatHash(route: Route): string {
  const { query } = route;
  const params = new URLSearchParams();
  const pairs: [string, string][] = [
    ['sev', query.sev.join(',')],
    ['rule', query.rule.join(',')],
    ['pair', query.pair ?? ''],
    ['file', query.file ?? ''],
    ['q', query.q],
    ['group', query.group === 'rule' ? '' : query.group],
    ['new', query.onlyNew ? '1' : ''],
  ];
  for (const [name, value] of pairs) {
    if (value !== '') {
      params.set(name, value);
    }
  }
  const search = params.toString();
  const param =
    route.param === undefined || route.param === '' ? '' : `/${encodeURIComponent(route.param)}`;
  return `#/${route.view}${param}${search === '' ? '' : `?${search}`}`;
}
