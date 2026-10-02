import { describe, expect, it } from 'vite-plus/test';

import { defaultAssetsDir, readAsset } from '#src/devtools/assets.ts';
import { renderShell } from '#src/devtools/shell.ts';
import { hotFiles, layerStats } from '#src/devtools/stats.ts';
import { makeEdge, makeFinding, makeResult } from '#test/factories.ts';

describe('hotFiles', () => {
  it('ranks files by errors, then warnings, then path', () => {
    const findings = [
      makeFinding({ file: '/app/b.vue', severity: 'warn' }),
      makeFinding({ file: '/app/a.vue', severity: 'warn' }),
      makeFinding({ file: '/app/c.vue' }),
      makeFinding({ file: '/app/b.vue', severity: 'warn' }),
    ];
    expect(hotFiles(findings, '/app')).toEqual([
      { file: 'c.vue', absFile: '/app/c.vue', errors: 1, warnings: 0 },
      { file: 'b.vue', absFile: '/app/b.vue', errors: 0, warnings: 2 },
      { file: 'a.vue', absFile: '/app/a.vue', errors: 0, warnings: 1 },
    ]);
  });

  it('keeps the top 8', () => {
    const findings = Array.from({ length: 12 }, (_, index) =>
      makeFinding({ file: `/app/f${index}.vue` }),
    );
    expect(hotFiles(findings, '/app')).toHaveLength(8);
  });
});

describe('layerStats', () => {
  it('counts files and references across layer borders', () => {
    const result = makeResult({
      config: { layers: { web: { allow: ['shop'] } } },
      files: ['/app/pages/index.vue', '/app/layers/shop/a.ts', '/app/layers/shop/b.ts'],
      edges: [
        makeEdge(),
        makeEdge({ symbol: 'useTotal' }),
        makeEdge({ fromLayer: 'shop', toLayer: 'shop', file: '/app/layers/shop/a.ts' }),
        makeEdge({ to: null, toLayer: null, external: 'vue' }),
      ],
    });
    expect(layerStats(result)).toEqual([
      { name: 'web', root: '.', allow: ['shop'], files: 1, refsIn: 0, refsOut: 2 },
      { name: 'shop', root: 'layers/shop', allow: null, files: 2, refsIn: 2, refsOut: 0 },
    ]);
  });
});

describe('renderShell', () => {
  it('embeds the config as json that html parsing cannot change', () => {
    const html = renderShell(
      { base: '/__layerscope', openInEditor: '/x?a=1&b=</template>' },
      '1.0.0',
    );
    const config = /<template id="config">(?<json>.*)<\/template>/u.exec(html)?.groups?.json ?? '';
    expect(config).not.toContain('<');
    expect(config).not.toContain('&');
    expect(JSON.parse(config)).toEqual({
      base: '/__layerscope',
      openInEditor: '/x?a=1&b=</template>',
    });
  });

  it('links the versioned client assets', () => {
    const html = renderShell({ base: '/__layerscope', openInEditor: '/e' }, '1.2.3');
    expect(html).toContain('src="/__layerscope/assets/client.js?v=1.2.3"');
    expect(html).toContain('href="/__layerscope/assets/client.css?v=1.2.3"');
  });
});

describe('assets', () => {
  it('finds the built client next to the package from source', () => {
    expect(defaultAssetsDir()).toMatch(/\/dist\/devtools\/$/u);
  });

  it('reads nothing for unknown names or a missing dir', async () => {
    expect(await readAsset('/nope', 'client.js')).toBeNull();
    expect(await readAsset('/nope', '../client.js')).toBeNull();
  });
});
