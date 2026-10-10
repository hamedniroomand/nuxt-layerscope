import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_VIOLATIONS, run } from '#src/cli.ts';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function page(...lines: string[]): string {
  return `<script setup lang="ts">\n${lines.join('\n')}\n</script>\n`;
}

interface Shape {
  /** A `core` layer, the base of the `features` preset when it is set. */
  core?: boolean;
  /** A `shared` layer, the one base layer of `layered`. */
  shared?: boolean;
  /** Root uses `website`, which makes a cycle with `website` using root. */
  rootUsesWebsite?: boolean;
  /** `website` also uses `admin`, to check that a real boundary still fails. */
  crossing?: boolean;
  /** The `allow` of `website`, as config text. Left out, the preset decides it. */
  allowWebsite?: string;
  /** The `allow` of `root`, as config text. Left out, the preset decides it. */
  allowRoot?: string;
}

/** `extra` is more config text. The layers are declared by path, so no Nuxt install is needed. */
function project(extra: string, shape: Shape = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-preset-root-')));
  write(root, 'app/composables/useShared.ts', 'export const useShared = () => 1;\n');
  write(root, 'layers/admin/app/composables/useAdmin.ts', 'export const useAdmin = () => 1;\n');
  write(root, 'layers/website/app/composables/useWeb.ts', 'export const useWeb = () => 1;\n');
  const declared = [
    "  const useShared: typeof import('../../app/composables/useShared').useShared",
    "  const useAdmin: typeof import('../../layers/admin/app/composables/useAdmin').useAdmin",
    "  const useWeb: typeof import('../../layers/website/app/composables/useWeb').useWeb",
  ];
  if (shape.core === true) {
    write(root, 'layers/core/app/composables/useCore.ts', 'export const useCore = () => 1;\n');
    declared.push(
      "  const useCore: typeof import('../../layers/core/app/composables/useCore').useCore",
    );
  }
  write(
    root,
    '.nuxt/types/imports.d.ts',
    ['export {}', 'declare global {', ...declared, '}', ''].join('\n'),
  );
  write(root, '.nuxt/components.d.ts', '\n');
  const layers = [
    `website: { path: 'layers/website'${shape.allowWebsite === undefined ? '' : `, ${shape.allowWebsite}`} }`,
    "admin: { path: 'layers/admin' }",
    ...(shape.core === true ? ["core: { path: 'layers/core' }"] : []),
    ...(shape.shared === true ? ["shared: { path: 'layers/shared' }"] : []),
    ...(shape.allowRoot === undefined ? [] : [`root: { ${shape.allowRoot} }`]),
  ];
  write(
    root,
    'layerscope.config.mjs',
    `export default { layers: { ${layers.join(', ')} }, ${extra} };\n`,
  );
  write(
    root,
    'layers/website/app/pages/shop.vue',
    page('const shared = useShared();', shape.crossing === true ? 'const admin = useAdmin();' : ''),
  );
  write(root, 'layers/admin/app/pages/admin.vue', page('const shared = useShared();'));
  if (shape.rootUsesWebsite === true) {
    write(root, 'app/pages/index.vue', page('const web = useWeb();'));
  }
  return root;
}

interface CliResult {
  code: number;
  out: string;
}

/** Notes go to stderr, so both streams are read. */
async function check(root: string): Promise<CliResult> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', 'check', root]);
  const text = [...out.mock.calls, ...err.mock.calls].map(call => String(call[0])).join('');
  vi.restoreAllMocks();
  return { code, out: text };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a preset whose base is root', () => {
  it('passes with features that use root and never each other, and no allow list', async () => {
    const { code, out } = await check(project("preset: { name: 'features', base: ['root'] }"));
    expect(code).toBe(EXIT_CLEAN);
    expect(out).not.toContain('layer-boundary');
  });

  it('still reports a feature that uses another feature', async () => {
    const { code, out } = await check(
      project("preset: { name: 'features', base: ['root'] }", { crossing: true }),
    );
    expect(code).toBe(EXIT_VIOLATIONS);
    expect(out).toContain('crosses from layer "website" into "admin"');
  });

  it('restricts root, so root code that uses a feature is reported without layer-cycle', async () => {
    const { code, out } = await check(
      project("preset: { name: 'features', base: ['root'] }", { rootUsesWebsite: true }),
    );
    expect(code).toBe(EXIT_VIOLATIONS);
    expect(out).toContain('crosses from layer "root" into "website"');
  });

  it('lets a root entry in the config clear that finding', async () => {
    const { code, out } = await check(
      project("preset: { name: 'features', base: ['root'] }", {
        rootUsesWebsite: true,
        allowRoot: "allow: ['website']",
      }),
    );
    expect(code).toBe(EXIT_CLEAN);
    expect(out).not.toContain('from layer "root"');
  });

  it('leaves root unrestricted when root is not in the preset base', async () => {
    const { out } = await check(
      project("preset: 'features'", { core: true, rootUsesWebsite: true }),
    );
    expect(out).not.toContain('from layer "root"');
  });
});

describe('the root hint under the layered and stacked presets', () => {
  it('moves shared into a features base with root, so the layer keeps shared', async () => {
    const { out } = await check(project("preset: 'layered'", { shared: true }));
    expect(out).toContain("preset: { name: 'features', base: ['root', 'shared'] }");
    expect(out).not.toContain("base: ['root']");
  });

  it('gives a stacked layer its full allow list with root, not a stacked base', async () => {
    const { out } = await check(project("preset: 'stacked'"));
    expect(out).toContain('replaces its preset list');
    expect(out).toMatch(/set allow for "(website|admin)" to \[[^\]]*'root'\]/u);
    expect(out).not.toContain("name: 'stacked'");
  });
});

describe('the root hint under a preset', () => {
  it('names the preset base when the preset gave the layer its allow', async () => {
    const { out } = await check(project("preset: 'features'", { core: true }));
    expect(out).toContain(
      "add 'root' to the preset base: preset: { name: 'features', base: ['root', 'core'] }",
    );
    expect(out).not.toContain("add 'root' to its allow list");
  });

  it('keeps the allow-list wording when the user wrote the allow', async () => {
    const { out } = await check(project('', { allowWebsite: "allow: ['admin']" }));
    expect(out).toContain("add 'root' to its allow list");
    expect(out).not.toContain('preset base');
  });
});
