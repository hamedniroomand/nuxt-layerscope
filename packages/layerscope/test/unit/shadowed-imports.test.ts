import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, onTestFinished } from 'vite-plus/test';

import { shadowedImports } from '#src/module/imports.ts';
import type { Unimport, UnimportImport } from '#src/module/nuxt.ts';

/** A context whose `getImports()` gives `used`, with the entries before the dedupe. */
function context(
  dynamic: UnimportImport[],
  used: UnimportImport[],
  statics: UnimportImport[] = [],
): Unimport {
  return {
    getImports: async () => {
      const list = await Promise.resolve(used);
      return list;
    },
    getInternalContext: () => ({ staticImports: statics, dynamicImports: dynamic }),
  };
}

const same = (path: string): string => path;
const ROOT = { name: 'useCart', from: '/p/app/composables/useCart.ts' };
const BASE = { name: 'useCart', from: '/p/base/app/composables/useCart.ts' };

describe('shadowedImports', () => {
  it('gives an entry that unimport drops, with the entry of the same name that it uses', async () => {
    expect(await shadowedImports(context([ROOT, BASE], [ROOT]), same)).toEqual([
      { name: 'useCart', file: BASE.from, shadowedBy: ROOT.from },
    ]);
  });

  it('reads the static entries too, as the `imports` option of a layer gives them', async () => {
    expect(await shadowedImports(context([ROOT], [ROOT], [BASE]), same)).toEqual([
      { name: 'useCart', file: BASE.from, shadowedBy: ROOT.from },
    ]);
  });

  it('uses the name that the entry is auto-imported as', async () => {
    const alias = { name: 'default', as: 'useCart', from: BASE.from };
    const [entry] = await shadowedImports(context([ROOT, alias], [ROOT]), same);
    expect(entry.name).toBe('useCart');
  });
});

describe('shadowedImports and the path of the winner', () => {
  it('resolves the winner with toFile and finds its file as a bundler does', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'layerscope-imports-'));
    onTestFinished(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    // Nuxt presets give the path without the extension: the file on disk is `fetch.js`.
    writeFileSync(join(dir, 'fetch.js'), '');
    const preset = { name: 'useFetch', from: '#app/fetch' };
    const base = { name: 'useFetch', from: BASE.from };
    const found = await shadowedImports(context([base], [preset], [preset]), path =>
      path.replace('#app', dir),
    );
    expect(found).toEqual([
      { name: 'useFetch', file: BASE.from, shadowedBy: join(dir, 'fetch.js') },
    ]);
  });

  it('finds the file of an absolute winner path without an extension', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'layerscope-imports-'));
    onTestFinished(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    // A module can add `addImports({ from: resolver.resolve('./runtime/useCart') })`.
    writeFileSync(join(dir, 'useCart.ts'), '');
    const module = { name: 'useCart', from: join(dir, 'useCart') };
    const found = await shadowedImports(context([module, BASE], [module]), same);
    expect(found).toEqual([
      { name: 'useCart', file: BASE.from, shadowedBy: join(dir, 'useCart.ts') },
    ]);
  });

  it('keeps the import path of a winner when no file is found', async () => {
    const preset = { name: 'useFetch', from: '#app/composables/fetch' };
    const base = { name: 'useFetch', from: BASE.from };
    const found = await shadowedImports(context([base], [preset], [preset]), path =>
      path.replace('#app', '/nonexistent/nuxt/dist/app'),
    );
    expect(found).toEqual([
      { name: 'useFetch', file: BASE.from, shadowedBy: '#app/composables/fetch' },
    ]);
  });
});

describe('shadowedImports and a scanned enum', () => {
  it('gives the value entry of a scanned enum, and not its type twin', async () => {
    // unimport gives `declarationType` only to the type twin, so it drops the value entry.
    const twin = { ...BASE, type: true, declarationType: 'enum' };
    expect(await shadowedImports(context([ROOT, BASE, twin], [ROOT, twin]), same)).toEqual([
      { name: 'useCart', file: BASE.from, shadowedBy: ROOT.from },
    ]);
  });
});

describe('shadowedImports and the entries that it skips', () => {
  it.each([
    ['an entry with an enum declaration, as a preset can give it', { declarationType: 'enum' }],
    ['a type', { type: true }],
    ['a disabled entry', { disabled: true }],
  ])('gives nothing for %s', async (_name, extra) => {
    expect(await shadowedImports(context([ROOT, { ...BASE, ...extra }], [ROOT]), same)).toEqual([]);
  });

  it('gives nothing when the entry that unimport uses is a type', async () => {
    const type = { ...ROOT, type: true };
    expect(await shadowedImports(context([type, BASE], [type, BASE]), same)).toEqual([]);
  });

  it('gives nothing for an entry that unimport uses, also when it is in the list twice', async () => {
    expect(await shadowedImports(context([ROOT, ROOT], [ROOT]), same)).toEqual([]);
  });

  it('gives nothing for an entry from a package', async () => {
    const lib = { name: 'useCart', from: 'cart-lib' };
    expect(await shadowedImports(context([ROOT, lib], [ROOT]), same)).toEqual([]);
  });

  it('gives nothing without the internal context or the context', async () => {
    const bare = context([], [ROOT]);
    expect(await shadowedImports({ getImports: bare.getImports }, same)).toEqual([]);
    expect(await shadowedImports(null, same)).toEqual([]);
  });

  it('gives nothing when the two paths are one file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'layerscope-imports-'));
    onTestFinished(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const target = join(dir, 'useCart.ts');
    const link = join(dir, 'link.ts');
    writeFileSync(target, '');
    symlinkSync(target, link);
    const used = { name: 'useCart', from: target };
    const linked = { name: 'useCart', from: link };
    expect(await shadowedImports(context([used, linked], [used]), same)).toEqual([]);
  });
});
