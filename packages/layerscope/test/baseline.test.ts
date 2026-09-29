import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_VIOLATIONS, run } from '#src/cli.ts';

const PAGE = 'layers/admin/app/pages/admin.vue';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function page(...lines: string[]): string {
  return `<script setup lang="ts">\n${lines.join('\n')}\n</script>\n`;
}

/** Two layers declared by path, so no Nuxt install is needed; admin may not use web. */
function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-baseline-')));
  write(root, 'layers/web/app/composables/useCart.ts', 'export const useCart = () => 1;\n');
  write(root, 'layers/web/app/composables/useOrders.ts', 'export const useOrders = () => 1;\n');
  write(
    root,
    '.nuxt/types/imports.d.ts',
    [
      'export {}',
      'declare global {',
      "  const useCart: typeof import('../../layers/web/app/composables/useCart').useCart",
      "  const useOrders: typeof import('../../layers/web/app/composables/useOrders').useOrders",
      '}',
      '',
    ].join('\n'),
  );
  write(root, '.nuxt/components.d.ts', '\n');
  write(
    root,
    'layerscope.config.mjs',
    "export default { layers: { admin: { path: 'layers/admin', allow: [] }, web: { path: 'layers/web' } } };\n",
  );
  write(root, PAGE, page('const cart = useCart();'));
  return root;
}

function captureStdout(): () => string {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  return () => out.mock.calls.map(call => String(call[0])).join('');
}

async function check(root: string, ...args: string[]): Promise<{ code: number; out: string }> {
  const stdout = captureStdout();
  const code = await run(['node', 'layerscope', 'check', root, ...args]);
  vi.restoreAllMocks();
  return { code, out: stdout() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('layerscope check --update-baseline', () => {
  it('writes every finding keyed without lines', async () => {
    const root = project();
    const { code, out } = await check(root, '--update-baseline');
    expect(code).toBe(EXIT_CLEAN);
    expect(out).toContain('Wrote 1 finding to');
    expect(JSON.parse(readFileSync(join(root, 'layerscope-baseline.json'), 'utf8'))).toEqual({
      version: 1,
      entries: [{ rule: 'layer-boundary', file: PAGE, symbol: 'useCart', toLayer: 'web' }],
    });
  });
});

async function baselined(): Promise<string> {
  const root = project();
  await check(root, '--update-baseline');
  return root;
}

describe('layerscope check with a baseline', () => {
  it('passes when nothing changed', async () => {
    const root = await baselined();
    const { code, out } = await check(root);
    expect(code).toBe(EXIT_CLEAN);
    expect(out).toContain('✔ No problems in 3 files across 3 layers, 1 more in the baseline');
  });

  it('fails on a new violation', async () => {
    const root = await baselined();
    write(root, PAGE, page('const cart = useCart();', 'const orders = useOrders();'));
    const { code, out } = await check(root);
    expect(code).toBe(EXIT_VIOLATIONS);
    expect(out).toContain('Auto-import "useOrders" crosses');
    expect(out).not.toContain('Auto-import "useCart" crosses');
  });

  it('does not fail when a violation moves within its file', async () => {
    const root = await baselined();
    write(root, PAGE, page('// moved down', '', 'const cart = useCart();'));
    expect((await check(root)).code).toBe(EXIT_CLEAN);
  });

  it('reads the baseline from --baseline', async () => {
    const root = await baselined();
    const { code } = await check(root, '--baseline', 'missing.json');
    expect(code).toBe(EXIT_VIOLATIONS);
  });
});

describe('layerscope check with fixed baseline entries', () => {
  it('reports them as removable', async () => {
    const root = await baselined();
    write(root, PAGE, page('const cart = 1;'));
    const { code, out } = await check(root);
    expect(code).toBe(EXIT_CLEAN);
    expect(out).toContain(
      [
        'layerscope-baseline.json: 1 fixed entry. Run "layerscope check --update-baseline" to remove it.',
        `  ${PAGE}  layer-boundary useCart → web`,
      ].join('\n'),
    );
  });

  it('lists removable entries in JSON and GitHub output', async () => {
    const root = await baselined();
    write(root, PAGE, page('const cart = 1;'));
    const json = JSON.parse((await check(root, '--format', 'json')).out) as {
      baseline: { removable: unknown[] };
    };
    expect(json.baseline.removable).toEqual([
      { rule: 'layer-boundary', file: PAGE, symbol: 'useCart', toLayer: 'web' },
    ]);
    const github = (await check(root, '--format', 'github')).out;
    expect(github).toMatch(
      /^::notice file=.*layerscope-baseline\.json,title=layerscope baseline::/u,
    );
  });
});
