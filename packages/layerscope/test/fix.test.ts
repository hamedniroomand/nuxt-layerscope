import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
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

/** A path as `fix` prints it: relative to the working dir. */
function shown(root: string, path: string): string {
  return relative(process.cwd(), join(root, path));
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
});

describe('layerscope fix', () => {
  it('requires --dry-run or --apply', async () => {
    const output = silence();
    expect(await run(['node', 'layerscope', 'fix', project()])).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain(
      'fix needs --dry-run or --apply. --dry-run prints the moves. --apply makes them.',
    );
  });

  it('prints the move and the import it updates', async () => {
    const output = silence();
    const root = project();
    expect(await run(['node', 'layerscope', 'fix', root, '--dry-run'])).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain(`${shown(root, CART)} → ${shown(root, MOVED)}`);
    expect(output.stdout()).toContain(
      '"../../../web/app/composables/useCart" → "../../../shared/app/composables/useCart"',
    );
  });
});

describe('layerscope fix output', () => {
  it('prints the steps after the move, and no dry-run note', async () => {
    const output = silence();
    await run(['node', 'layerscope', 'fix', project(), '--dry-run']);
    expect(output.stdout()).toContain(
      'Make the moves with `--apply`, or move the files and update the imports yourself. Then run `layerscope check --prepare`.',
    );
    expect(output.stdout()).toContain('do not read test files, `nuxt.config.*`');
    expect(output.stdout()).not.toContain('(--dry-run)');
  });

  it('does not list a symbol that is not in the source', async () => {
    const output = silence();
    await run(['node', 'layerscope', 'fix', project(), '--dry-run']);
    // shop uses useCart as an auto-import, which has no import line to edit.
    expect(output.stdout()).not.toContain('shop.vue');
    expect(output.stdout()).toContain('admin.vue:2');
  });
});

describe('layerscope fix with nothing to move', () => {
  it('says so when the findings have no move', async () => {
    const root = project();
    write(root, 'layers/shop/app/pages/shop.vue', page('const a = 1;'));
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
    const output = silence();
    expect(await run(['node', 'layerscope', 'fix', root, '--dry-run'])).toBe(EXIT_CLEAN);
    expect(output.stdout()).toBe(
      'No file moves suggested.\n1 other finding has no file move. Run `layerscope check` to see them.\n',
    );
  });

  it('prints one line when there is nothing to fix', async () => {
    const root = project();
    write(root, 'layers/admin/app/pages/admin.vue', page('const a = 1;'));
    write(root, 'layers/shop/app/pages/shop.vue', page('const a = 1;'));
    const output = silence();
    await run(['node', 'layerscope', 'fix', root, '--dry-run']);
    expect(output.stdout()).toBe('No file moves suggested.\n');
  });

  it('skips the findings that the baseline accepts', async () => {
    const root = project();
    silence();
    expect(await run(['node', 'layerscope', 'check', root, '--update-baseline'])).toBe(EXIT_CLEAN);
    vi.restoreAllMocks();
    const output = silence();
    await run(['node', 'layerscope', 'fix', root, '--dry-run']);
    expect(output.stdout()).toBe('No file moves suggested.\n');
    vi.restoreAllMocks();
    const other = silence();
    await run(['node', 'layerscope', 'fix', root, '--dry-run', '--baseline', 'missing.json']);
    expect(other.stdout()).toContain('useCart.ts →');
  });
});

describe('layerscope fix options', () => {
  it('reads the config from --config', async () => {
    const root = project();
    // admin and shop may use web here, so there is no finding and no move.
    write(
      root,
      'config/layers.mjs',
      `export default { layers: {
        web: { path: 'layers/web', allow: [] },
        shared: { path: 'layers/shared', allow: [] },
        admin: { path: 'layers/admin', allow: ['shared', 'web'] },
        shop: { path: 'layers/shop', allow: ['shared', 'web'] },
      } };\n`,
    );
    const output = silence();
    const config = join(root, 'config/layers.mjs');
    expect(await run(['node', 'layerscope', 'fix', root, '--dry-run', '--config', config])).toBe(
      EXIT_CLEAN,
    );
    expect(output.stdout()).toBe('No file moves suggested.\n');
    const fallback = silence();
    expect(await run(['node', 'layerscope', 'fix', root, '--dry-run'])).toBe(EXIT_CLEAN);
    expect(fallback.stdout()).toContain('useCart.ts →');
  });

  it('reads the symbols from --source', async () => {
    const root = project();
    // The project has no registry, so only `--source registry` stops.
    const output = silence();
    expect(
      await run(['node', 'layerscope', 'fix', root, '--dry-run', '--source', 'registry']),
    ).toBe(EXIT_ERROR);
    expect(output.stderr()).toContain('registry.json not found');
    expect(output.stdout()).toBe('');
  });
});

describe('layerscope fix plans', () => {
  it('plans a moved importer and more than one move', async () => {
    const root = project();
    write(root, 'layers/web/app/composables/useTotal.ts', 'export const useTotal = () => 2;\n');
    write(
      root,
      CART,
      "import { noop } from '../../../shared/app/utils/noop';\nexport const useCart = () => noop();\n",
    );
    for (const layer of ['admin', 'shop']) {
      write(
        root,
        `layers/${layer}/app/pages/total-${layer}.vue`,
        page("import { useTotal } from '../../../web/app/composables/useTotal';", 'useTotal();'),
      );
    }
    const output = silence();
    await run(['node', 'layerscope', 'fix', root, '--dry-run']);
    const text = output.stdout();
    expect(text).toContain(`${shown(root, CART)} → ${shown(root, MOVED)}`);
    expect(text).toContain(
      `${shown(root, 'layers/web/app/composables/useTotal.ts')} → ${shown(root, 'layers/shared/app/composables/useTotal.ts')}`,
    );
    // The moved file is the importer here: its own import gets a new path.
    expect(text).toContain(
      `${shown(root, CART)}:1:22  "../../../shared/app/utils/noop" → "../utils/noop"`,
    );
  });
});
