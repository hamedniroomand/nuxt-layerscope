import { describe, expect, it } from 'vite-plus/test';

import { collectTopLevelNames, scanModule } from '#src/scan/script.ts';

function freeNames(code: string): string[] {
  return scanModule(code, 'file.ts').free.map(ref => ref.name);
}

describe('scanModule', () => {
  it('reports identifiers without a local binding', () => {
    expect(freeNames('export const a = useCart().total + formatPrice(1);')).toEqual([
      'useCart',
      'formatPrice',
    ]);
  });

  it('respects local, hoisted and parameter bindings', () => {
    const code = `
      export function run(useFoo: () => void) { useFoo(); useBar(); }
      function useBar() { const useBaz = 1; return useBaz; }
    `;
    expect(freeNames(code)).toEqual([]);
  });

  it('ignores type-only positions', () => {
    expect(freeNames('export const cart: Cart = {} as Order;')).toEqual([]);
  });

  it('ignores property keys and member names', () => {
    expect(freeNames('export const x = { useCart: 1 }; x.useCart;')).toEqual([]);
  });
});

describe('scanModule type syntax', () => {
  it('ignores labels of tuple members', () => {
    const code = `
      export type Emits = { close: [value: boolean]; navigate: [id: string, height: number] };
      export const tags: [attribute: string, key: string][] = [];
    `;
    expect(freeNames(code)).toEqual([]);
  });

  it('ignores parameter names in function and signature types', () => {
    const code = `
      export type Push = (...next: string[]) => void;
      export interface Api { on(event: string, handler: (index: number) => void): void }
      export type Ctor = new (item: string) => object;
    `;
    expect(freeNames(code)).toEqual([]);
  });

  it('ignores typeof queries in type positions', () => {
    const code = `
      import type { h as createElement } from 'vue';
      export type Render = typeof createElement;
    `;
    expect(freeNames(code)).toEqual([]);
  });

  it('still reports references next to types', () => {
    expect(freeNames('export const a: [id: string] = [useId()];')).toEqual(['useId']);
  });
});

describe('scanModule imports and components', () => {
  it('collects static, re-exported and dynamic imports', () => {
    const scan = scanModule(
      `import a, { b as c } from './a';
       export { d } from '#layers/web/d';
       export * from 'pkg';
       void import('./lazy');`,
      'file.ts',
    );
    expect(scan.imports.map(ref => [ref.specifier, ref.names])).toEqual([
      ['./a', ['default', 'b']],
      ['#layers/web/d', ['d']],
      ['pkg', ['*']],
      ['./lazy', ['*']],
    ]);
  });

  it('treats resolveComponent with a literal as a component reference', () => {
    const scan = scanModule("export const c = resolveComponent('BaseButton');", 'file.ts');
    expect(scan.components.map(ref => ref.name)).toEqual(['BaseButton']);
  });

  it('treats resolveComponent with a runtime value as a dynamic component', () => {
    const scan = scanModule(
      'export const c = (name: string) => resolveComponent(name);',
      'file.ts',
    );
    expect(scan.components).toEqual([]);
    expect(scan.dynamicComponents).toHaveLength(1);
  });

  it('reports parse errors instead of throwing', () => {
    expect(scanModule('const = ;', 'file.ts').error).not.toBeNull();
  });
});

describe('collectTopLevelNames', () => {
  it('maps top-level identifiers for template fallback bindings', () => {
    expect(collectTopLevelNames('const cart = 1;\nfunction useLocal() {}\n', 'ts')).toEqual({
      cart: 'setup-maybe-ref',
      useLocal: 'setup-maybe-ref',
    });
  });
});
