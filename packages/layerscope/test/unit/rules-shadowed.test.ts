import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { OwnerLookup } from '#src/nuxt/owner.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { Registry, ShadowedFile } from '#src/registry/schema.ts';
import { shadowedFileFindings, shadowedFindings } from '#src/rules/shadowed.ts';
import { realPath } from '#src/utils/fs.ts';
import { makeLayer, makeRegistry } from '#test/factories.ts';

const ownerOf = createOwnerLookup([
  makeLayer('base', '/nonexistent/base'),
  makeLayer('app', '/nonexistent/app'),
]);

describe('shadowedFindings', () => {
  it('reports a component overridden by another layer', () => {
    const registry = makeRegistry([
      [
        'BaseCard',
        '/nonexistent/base/app/components/BaseCard.vue',
        '/nonexistent/app/app/components/BaseCard.vue',
      ],
    ]);
    expect(shadowedFindings(registry, ownerOf, {})).toMatchObject([
      {
        rule: 'shadowed-component',
        severity: 'warn',
        symbol: 'BaseCard',
        fromLayer: 'base',
        toLayer: 'app',
        line: 1,
        column: 1,
        message: 'Component <BaseCard> of layer "base" is overridden by layer "app"',
      },
    ]);
  });

  it('names the file when the winner lives outside every layer', () => {
    const registry = makeRegistry([
      ['BaseCard', '/nonexistent/base/app/components/BaseCard.vue', '/elsewhere/BaseCard.vue'],
    ]);
    const [finding] = shadowedFindings(registry, ownerOf, {});
    expect(finding.toLayer).toBeNull();
    expect(finding.message).toContain('overridden by /elsewhere/BaseCard.vue');
  });

  it('ignores shadowed components outside every layer', () => {
    const registry = makeRegistry([
      ['Lib', '/elsewhere/node_modules/lib/Lib.vue', '/nonexistent/app/app/components/Lib.vue'],
    ]);
    expect(shadowedFindings(registry, ownerOf, {})).toEqual([]);
  });

  it('reports nothing when the rule is off', () => {
    const registry = makeRegistry([['A', '/nonexistent/base/A.vue', '/nonexistent/app/A.vue']]);
    const config = { rules: { 'shadowed-component': 'off' as const } };
    expect(shadowedFindings(registry, ownerOf, config)).toEqual([]);
  });
});

describe('shadowedFindings with a module specifier', () => {
  it('keeps a module specifier of the winner as it is, in any current dir', () => {
    const registry = makeRegistry([
      ['Icon', '/nonexistent/base/app/components/Icon.vue', '@iconify/vue'],
    ]);
    const [finding] = shadowedFindings(registry, ownerOf, {});
    expect(finding.toLayer).toBeNull();
    expect(finding.target).toBe('@iconify/vue');
    expect(finding.message).toBe('Component <Icon> of layer "base" is overridden by @iconify/vue');
  });
});

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A `base` and an `app` layer on disk, with empty files at the paths. */
function layers(files: string[]): { root: string; lookup: OwnerLookup } {
  const root = realPath(mkdtempSync(join(tmpdir(), 'layerscope-shadowed-')));
  created.push(root);
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), '');
  }
  const lookup = createOwnerLookup([
    makeLayer('base', join(root, 'base')),
    makeLayer('app', join(root, 'app')),
  ]);
  return { root, lookup };
}

function registryWith(fields: Partial<Registry>): Registry {
  return { ...makeRegistry(), ...fields };
}

/** The entry for `base/<path>`, which `app/<path>` replaces. */
function entryOf(root: string, name: string, path: string): ShadowedFile {
  return { name, file: join(root, 'base', path), shadowedBy: join(root, 'app', path) };
}

describe('shadowedFileFindings', () => {
  it('reports a layout and a middleware overridden by another layer', () => {
    const { root, lookup } = layers([
      'base/layouts/default.vue',
      'app/layouts/default.vue',
      'base/middleware/auth.ts',
      'app/middleware/auth.ts',
    ]);
    const registry = registryWith({
      shadowedLayouts: [entryOf(root, 'default', 'layouts/default.vue')],
      shadowedMiddleware: [entryOf(root, 'auth', 'middleware/auth.ts')],
    });
    expect(shadowedFileFindings(registry, lookup, {})).toMatchObject([
      {
        rule: 'shadowed-layout',
        severity: 'warn',
        file: join(root, 'base/layouts/default.vue'),
        line: 1,
        column: 1,
        symbol: 'default',
        fromLayer: 'base',
        toLayer: 'app',
        target: join(root, 'app/layouts/default.vue'),
        message: 'Layout "default" of layer "base" is overridden by layer "app"',
      },
      {
        rule: 'shadowed-middleware',
        symbol: 'auth',
        message: 'Middleware "auth" of layer "base" is overridden by layer "app"',
      },
    ]);
  });

  it('names the file when the winner is outside every layer', () => {
    const { root, lookup } = layers(['base/layouts/default.vue', 'lib/default.vue']);
    const entry = {
      ...entryOf(root, 'default', 'layouts/default.vue'),
      shadowedBy: join(root, 'lib/default.vue'),
    };
    const [finding] = shadowedFileFindings(registryWith({ shadowedLayouts: [entry] }), lookup, {});
    expect(finding.toLayer).toBeNull();
    expect(finding.message).toBe(
      `Layout "default" of layer "base" is overridden by ${join(root, 'lib/default.vue')}`,
    );
  });
});

describe('shadowedFileFindings and the severity', () => {
  it('reports nothing for a rule that is off', () => {
    const { root, lookup } = layers(['base/a.ts', 'app/a.ts']);
    const entry = entryOf(root, 'a', 'a.ts');
    const registry = registryWith({ shadowedLayouts: [entry], shadowedMiddleware: [entry] });
    const config = { rules: { 'shadowed-layout': 'off' as const } };
    expect(shadowedFileFindings(registry, lookup, config).map(f => f.rule)).toEqual([
      'shadowed-middleware',
    ]);
  });
});

describe('shadowedFileFindings and files that are gone', () => {
  it.each([
    ['the file that lost', 'app/a.ts'],
    ['the file that won', 'base/a.ts'],
  ])('reports nothing when %s is gone', (_name, kept) => {
    const { root, lookup } = layers([kept]);
    const registry = registryWith({ shadowedLayouts: [entryOf(root, 'a', 'a.ts')] });
    expect(shadowedFileFindings(registry, lookup, {})).toEqual([]);
  });

  it('throws an error other than a missing file', () => {
    const { root, lookup } = layers(['base/a.ts', 'app/a.ts']);
    const registry = registryWith({ shadowedLayouts: [entryOf(root, 'a', 'a.ts')] });
    chmodSync(join(root, 'base'), 0o000);
    created.unshift(join(root, 'base'));
    expect(() => shadowedFileFindings(registry, lookup, {})).toThrow(/EACCES/u);
  });
});
