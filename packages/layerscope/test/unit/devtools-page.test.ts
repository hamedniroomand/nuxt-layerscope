import { describe, expect, it } from 'vite-plus/test';

import { renderError, renderPage } from '#src/devtools/page.ts';
import type { AnalyzeResult, Finding, Layer } from '#src/types.ts';

const finding: Finding = {
  rule: 'layer-boundary',
  severity: 'error',
  file: '/app/layers/admin/a.vue',
  line: 2,
  column: 14,
  symbol: 'useCart',
  fromLayer: 'admin',
  toLayer: 'web',
  target: '/app/layers/web/useCart.ts',
  allowed: ['shared'],
  message: 'Auto-import "useCart" crosses from layer "admin" into "web"',
};

function layer(name: string, root: string): Layer {
  return {
    name,
    root,
    srcDir: root,
    serverDir: `${root}/server`,
    sharedDir: `${root}/shared`,
    defaultComponents: true,
  };
}

const result = {
  rootDir: '/app',
  config: { layers: { admin: { allow: ['shared'] } } },
  source: 'registry',
  files: ['/app/layers/admin/a.vue'],
  layers: [layer('root', '/app'), layer('admin', '/app/layers/admin')],
  findings: [finding],
  notes: ['a <note>'],
} as unknown as AnalyzeResult;

describe('renderPage', () => {
  const html = renderPage({
    result,
    openInEditor: '/_nuxt/__open-in-editor',
  });

  it('lists layers with their allowed dependencies', () => {
    expect(html).toContain('<td>admin</td><td><code>layers/admin</code></td><td>shared</td>');
    expect(html).toContain('<td>root</td><td><code>.</code></td><td><em>unrestricted</em></td>');
  });

  it('links findings to the editor by absolute path', () => {
    expect(html).toContain('data-open="/app/layers/admin/a.vue:2:14">layers/admin/a.vue:2:14</a>');
    expect(html).toContain('<template id="open-endpoint">/_nuxt/__open-in-editor</template>');
  });

  it('escapes text from the project', () => {
    expect(html).toContain('Auto-import &quot;useCart&quot;');
    expect(html).toContain('a &lt;note&gt;');
  });
});

describe('renderError', () => {
  it('shows the message escaped', () => {
    expect(renderError('bad <config>')).toContain('bad &lt;config&gt;');
  });
});
