import { describe, expect, it } from 'vite-plus/test';

import { scanModule } from '#src/scan/script.ts';
import { scanVue } from '#src/scan/vue.ts';

function firstImport(code: string, file = 'file.ts'): ReturnType<typeof scanModule>['imports'][0] {
  return scanModule(code, file).imports[0];
}

describe('type-only imports in the scanner', () => {
  it.each([
    ["import type { A } from './x';", ['A']],
    ["import type A from './x';", ['default']],
    ["import type * as ns from './x';", ['*']],
    ["import { type A, type B } from './x';", ['A', 'B']],
    ["export type { A } from './x';", ['A']],
    ["export { type A } from './x';", ['A']],
    ["export type * from './x';", ['*']],
  ])('marks %s as type-only', (code, names) => {
    const ref = firstImport(code);
    expect(ref.names).toEqual(names);
    expect(ref.typeOnly).toBe(true);
  });

  it('marks `import type x = require()` as type-only', () => {
    const ref = firstImport("import type x = require('./x');", 'file.cts');
    expect(ref.typeOnly).toBe(true);
  });

  it.each([
    ["import { a } from './x';"],
    ["import A from './x';"],
    ["import * as ns from './x';"],
    ["import './x';"],
    ["import {} from './x';"],
    ["export { a } from './x';"],
    ["export * from './x';"],
    ["import x = require('./x');"],
    ["const x = require('./x');"],
    ["import('./x');"],
  ])('does not mark %s', code => {
    expect(firstImport(code, 'file.cts').typeOnly).toBe(false);
  });
});

describe('mixed imports in the scanner', () => {
  it('keeps the value names of a mixed import', () => {
    const ref = firstImport("import { a, type B } from './x';");
    expect(ref.typeOnly).toBe(false);
    expect(ref.names).toEqual(['a', 'B']);
    expect(ref.typeNames).toEqual(['B']);
  });

  it('treats a default import with a type name as a value import', () => {
    const ref = firstImport("import A, { type B } from './x';");
    expect(ref.typeOnly).toBe(false);
    expect(ref.names).toEqual(['default', 'B']);
    expect(ref.typeNames).toEqual(['B']);
  });

  it('keeps a name that a type and a value both bring in', () => {
    const imported = firstImport("import { type A, A as B } from './x';");
    expect(imported.typeOnly).toBe(false);
    expect(imported.typeNames).toEqual([]);
    const exported = firstImport("export { type A, A as B } from './x';");
    expect(exported.typeOnly).toBe(false);
    expect(exported.typeNames).toEqual([]);
  });

  it('marks a re-export without names as a value statement', () => {
    expect(firstImport("export {} from './x';").typeOnly).toBe(false);
    expect(firstImport("export type {} from './x';").typeOnly).toBe(true);
  });

  it('keeps the value names of a mixed re-export', () => {
    const ref = firstImport("export { a, type B } from './x';");
    expect(ref.typeOnly).toBe(false);
    expect(ref.typeNames).toEqual(['B']);
  });

  it('finds a type-only import in a script setup block', () => {
    const source = `<script setup lang="ts">
import type { Props } from './props';
import { helper, type Extra } from './helper';
defineProps<Props>();
helper();
</script>
`;
    const [props, helper] = scanVue(source, 'A.vue').imports;
    expect(props.typeOnly).toBe(true);
    expect(helper.typeOnly).toBe(false);
    expect(helper.typeNames).toEqual(['Extra']);
  });
});
