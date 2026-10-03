import { describe, expect, it } from 'vite-plus/test';

import { allowHint } from '#src/devtools/hints.ts';
import { baselineView } from '#src/devtools/views-api.ts';
import type { Finding } from '#src/types.ts';
import { server } from '#test/devtools-server.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

const allow: Finding['suggestion'] = {
  action: 'allow',
  message: 'allow "web" to use "shop"',
  impact: { fixes: 3, edges: 1 },
};

describe('allow hint', () => {
  it('counts the files of the pair, baselined ones too, and quotes the snippet', () => {
    const finding = makeFinding({ suggestion: allow });
    const result = makeResult({
      config: { layers: { web: { allow: ['base'] } } },
      findings: [finding, makeFinding({ file: '/app/pages/b.vue' })],
      baseline: {
        file: '/app/b.json',
        suppressed: [makeFinding({ file: '/app/pages/c.vue' })],
        removable: [],
      },
    });
    expect(allowHint(finding, result)).toEqual({
      kind: 'allow',
      layer: 'web',
      add: 'shop',
      resolves: 3,
      files: 3,
      baselined: 1,
      snippet: "layers: {\n  web: { allow: ['base', 'shop'] },\n}",
    });
    const odd = makeFinding({ fromLayer: 'my-layer', toLayer: "o'k", suggestion: allow });
    expect(allowHint(odd, makeResult())?.snippet).toBe(
      String.raw`layers: {
  'my-layer': { allow: ['o\'k'] },
}`,
    );
  });

  it('gives no hint for move and leave suggestions', () => {
    const move = makeFinding({
      suggestion: { action: 'move', message: 'move it', impact: { fixes: 1 } },
    });
    const leave = makeFinding({
      suggestion: { action: 'leave', message: 'leave it', impact: { fixes: 0 } },
    });
    expect(allowHint(move, makeResult())).toBeUndefined();
    expect(allowHint(leave, makeResult())).toBeUndefined();
    expect(allowHint(makeFinding(), makeResult())).toBeUndefined();
  });
});

describe('baseline view', () => {
  it('keys suppressed findings like live ones and keeps removable entries', () => {
    const entry = { rule: 'layer-boundary' as const, file: 'gone.vue', symbol: 'x', toLayer: null };
    const view = baselineView(
      makeResult({
        baseline: {
          file: '/app/layerscope-baseline.json',
          suppressed: [makeFinding()],
          removable: [entry],
        },
      }),
    );
    expect(view.file).toBe('layerscope-baseline.json');
    expect(view.suppressed[0]).toMatchObject({
      file: 'pages/index.vue',
      absFile: '/app/pages/index.vue',
      key: 'layer-boundary\0pages/index.vue\0useCart\0shop',
    });
    expect(view.removable).toEqual([entry]);
    expect(baselineView(makeResult())).toEqual({ file: null, suppressed: [], removable: [] });
  });
});

describe('view endpoints', () => {
  it('serves symbols, trace, unused and baseline from the cached snapshot', async () => {
    const { fetch, run } = await server();
    run.mockResolvedValue(makeResult({ findings: [makeFinding({ suggestion: allow })] }));
    const report = (await (await fetch('/api/report')).json()) as {
      report: { findings: { hint?: { add: string } }[] };
    };
    expect(report.report.findings[0]?.hint).toMatchObject({ add: 'shop' });
    for (const path of [
      '/api/symbols',
      '/api/trace?symbol=useCart',
      '/api/unused',
      '/api/baseline',
    ]) {
      // eslint-disable-next-line no-await-in-loop -- one request after another
      const response = await fetch(path);
      expect(response.status, path).toBe(200);
    }
    expect(await (await fetch('/api/trace')).json()).toMatchObject({ targets: [] });
    expect(await (await fetch('/api/baseline')).json()).toEqual({
      file: null,
      suppressed: [],
      removable: [],
    });
    expect(run).toHaveBeenCalledOnce();
    const etag = (await fetch('/api/unused')).headers.get('etag') ?? '';
    const cached = await fetch('/api/unused', { headers: { 'if-none-match': etag } });
    expect(cached.status).toBe(304);
    expect((await fetch('/api/symbols', { method: 'POST' })).status).toBe(405);
  });
});

describe('graph endpoints', () => {
  it('serves the graph, an edge and a node, and 404 for unknown layers', async () => {
    const { fetch } = await server();
    const graph = (await (await fetch('/api/graph')).json()) as { matrix: { layers: string[] } };
    expect(graph.matrix.layers).toEqual(['web', 'shop']);
    expect((await fetch('/api/edge?from=web&to=shop')).status).toBe(200);
    expect((await fetch('/api/edge?from=web&to=nope')).status).toBe(404);
    expect((await fetch('/api/edge')).status).toBe(404);
    const node = (await (await fetch('/api/node?layer=web&offset=1')).json()) as { offset: number };
    expect(node.offset).toBe(1);
    expect((await fetch('/api/node?layer=web&offset=-5')).status).toBe(200);
    expect((await fetch('/api/node?layer=nope')).status).toBe(404);
  });
});
