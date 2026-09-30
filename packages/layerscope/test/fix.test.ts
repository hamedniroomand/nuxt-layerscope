import { mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, EXIT_ERROR, EXIT_VIOLATIONS, run } from '#src/cli.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const CART = 'layers/web/app/composables/useCart.ts';
const MOVED = 'layers/shared/app/composables/useCart.ts';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function page(...lines: string[]): string {
  return `<script setup lang="ts">\n${lines.join('\n')}\n</script>\n`;
}

function writeTypes(root: string, cartPath: string): void {
  const path = cartPath.replace('.ts', '');
  write(
    root,
    '.nuxt/types/imports.d.ts',
    `export {}\ndeclare global {\n  const useCart: typeof import('../../${path}').useCart\n}\n`,
  );
}

/** admin and shop both use useCart from web, which neither may depend on. */
function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-fix-')));
  write(root, CART, 'export const useCart = () => 1;\n');
  write(root, 'layers/shared/app/utils/noop.ts', 'export const noop = () => 0;\n');
  write(root, '.nuxt/components.d.ts', '\n');
  writeTypes(root, CART);
  write(
    root,
    'layerscope.config.mjs',
    `export default { layers: {
      web: { path: 'layers/web', allow: [] },
      shared: { path: 'layers/shared', allow: [] },
      admin: { path: 'layers/admin', allow: ['shared'] },
      shop: { path: 'layers/shop', allow: ['shared'] },
    } };\n`,
  );
  write(
    root,
    'layers/admin/app/pages/admin.vue',
    page("import { useCart as read } from '../../../web/app/composables/useCart';", 'read();'),
  );
  write(root, 'layers/shop/app/pages/shop.vue', page('useCart();'));
  return root;
}

function silence(): { stdout: () => string; stderr: () => string } {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
  return { stdout: () => text(out), stderr: () => text(err) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('suggestions', () => {
  it('suggest allowing a dependency used by one layer', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT });
    const boundary = result.findings.filter(finding => finding.rule === 'layer-boundary');
    expect(boundary.length).toBeGreaterThan(0);
    expect(boundary.map(finding => finding.suggestion?.action)).toEqual(
      boundary.map(() => 'allow'),
    );
  });

  it('suggest moving a file used by several layers to one they all may use', async () => {
    const root = project();
    const result = await analyze({ rootDir: root });
    expect(result.findings).toHaveLength(2);
    for (const { suggestion } of result.findings) {
      expect(suggestion).toMatchObject({
        action: 'move',
        layer: 'shared',
        file: join(root, MOVED),
      });
      expect(suggestion?.impact).toMatchObject({ fixes: 2, files: 2, imports: 1 });
    }
  });

  it('pass check once the suggested move is applied', async () => {
    const root = project();
    silence();
    expect(await run(['node', 'layerscope', 'check', root])).toBe(EXIT_VIOLATIONS);

    mkdirSync(dirname(join(root, MOVED)), { recursive: true });
    renameSync(join(root, CART), join(root, MOVED));
    writeTypes(root, MOVED);
    write(
      root,
      'layers/admin/app/pages/admin.vue',
      page("import { useCart as read } from '../../../shared/app/composables/useCart';", 'read();'),
    );
    expect(await run(['node', 'layerscope', 'check', root])).toBe(EXIT_CLEAN);
  });
});

describe('layerscope fix', () => {
  it('requires --dry-run', async () => {
    const output = silence();
    expect(await run(['node', 'layerscope', 'fix', project()])).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('--dry-run');
  });

  it('prints the move and the import it updates', async () => {
    const output = silence();
    expect(await run(['node', 'layerscope', 'fix', project(), '--dry-run'])).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain('useCart.ts →');
    expect(output.stdout()).toContain(
      '"../../../web/app/composables/useCart" → "../../../shared/app/composables/useCart"',
    );
  });
});
