import { describe, expect, it } from 'vite-plus/test';

import { resolveImportRef } from '#src/analyze/import-refs.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { ImportRef } from '#src/scan/types.ts';

const table: SymbolTable = {
  imports: {
    app: new Map([
      ['useCart', { file: '/app/composables/useCart.ts', module: null }],
      ['useFetch', { file: null, module: 'nuxt' }],
    ]),
    server: new Map(),
    shared: new Map(),
  },
  components: new Map([['BaseButton', { file: '/app/components/BaseButton.vue', module: null }]]),
};

const env = { table, aliases: [] as [string, string][], buildDir: '/app/.nuxt' };

function ref(specifier: string, names: string[]): ImportRef {
  return { specifier, names, offset: 0 };
}

describe('resolveImportRef', () => {
  it('resolves #imports names through the symbol table', () => {
    expect(
      resolveImportRef(ref('#imports', ['useCart', 'useFetch']), '/app/a.ts', 'app', env),
    ).toEqual([
      {
        resolved: true,
        symbol: '#imports:useCart',
        target: { to: '/app/composables/useCart.ts', external: null },
      },
      {
        resolved: true,
        symbol: '#imports:useFetch',
        target: { to: null, external: 'nuxt' },
      },
    ]);
  });

  it('reports missing #imports and #components exports', () => {
    expect(resolveImportRef(ref('#imports', ['nope']), '/app/a.ts', 'app', env)).toEqual([
      { resolved: false, message: '"nope" is not exported by #imports' },
    ]);
    expect(resolveImportRef(ref('#components', ['Missing']), '/app/a.ts', 'app', env)).toEqual([
      { resolved: false, message: '"Missing" is not exported by #components' },
    ]);
  });

  it('resolves #components through the component map', () => {
    expect(resolveImportRef(ref('#components', ['BaseButton']), '/app/a.ts', 'app', env)).toEqual([
      {
        resolved: true,
        symbol: '#components:BaseButton',
        target: { to: '/app/components/BaseButton.vue', external: null },
      },
    ]);
  });

  it('treats packages as external and missing relatives as unresolved', () => {
    expect(resolveImportRef(ref('vue', ['ref']), '/app/a.ts', 'app', env)).toEqual([
      { resolved: true, symbol: 'vue', target: { to: null, external: 'vue' } },
    ]);
    expect(resolveImportRef(ref('./missing', ['x']), '/app/a.ts', 'app', env)).toEqual([
      { resolved: false, message: 'Cannot resolve import "./missing"' },
    ]);
  });
});
