import { describe, expect, it } from 'vite-plus/test';

import { scanModule } from '#src/scan/script.ts';

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
