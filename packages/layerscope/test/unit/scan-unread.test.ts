import { describe, expect, it } from 'vite-plus/test';

import { scanFile } from '#src/scan/index.ts';

const TS = '<script setup lang="ts">\nconst bar = ref<string | null>("x")\n</script>\n';

function unread(source: string, file = 'a.vue'): string[] {
  return scanFile(source, file).unread.map(part => `${part.symbol} ${part.message}`);
}

describe('TypeScript in a template', () => {
  it('reads a non-null assertion', () => {
    const scan = scanFile(
      `${TS}<template><div>{{ bar! }}<CartSummary />{{ useCart() }}</div></template>`,
      'a.vue',
    );
    expect(scan.unread).toEqual([]);
    expect(scan.components.map(ref => ref.name)).toEqual(['CartSummary']);
    expect(scan.templateIdents.map(ref => ref.name)).toEqual(['useCart']);
  });

  it('reads an `as` cast', () => {
    const scan = scanFile(
      `${TS}<template><div>{{ (bar as string).length }}<CartSummary /></div></template>`,
      'a.vue',
    );
    expect(scan.unread).toEqual([]);
    expect(scan.components.map(ref => ref.name)).toEqual(['CartSummary']);
  });

  it('reads TypeScript in a tsx script too', () => {
    const scan = scanFile(
      '<script setup lang="tsx">\nconst bar = 1\n</script>\n<template><CartSummary :a="bar!" /></template>',
      'a.vue',
    );
    expect(scan.unread).toEqual([]);
    expect(scan.components.map(ref => ref.name)).toEqual(['CartSummary']);
  });

  it('reads `a < b > (c)` in a JavaScript file as comparisons, not as a generic call', () => {
    const scan = scanFile(
      '<script setup>\nconst a = 1, b = 2, c = 3\n</script>\n<template><div>{{ a < b > (c) }}<CartSummary />{{ useCart() }}</div></template>',
      'a.vue',
    );
    expect(scan.unread).toEqual([]);
    expect(scan.components.map(ref => ref.name)).toEqual(['CartSummary']);
    expect(scan.templateIdents.map(ref => ref.name)).toEqual(['useCart']);
  });

  it('reports TypeScript in a template of a JavaScript file instead of dropping it', () => {
    const messages = unread(
      '<script setup>\nconst bar = 1\n</script>\n<template>{{ bar! }}</template>',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(
      /^<template> Could not read the template render code: .+\. Uses in this template are not checked\.$/u,
    );
  });
});

describe('a template that cannot be read', () => {
  it('reports a template with another language', () => {
    expect(unread('<template lang="pug">\ndiv\n  CartSummary\n</template>')).toEqual([
      '<template> Could not read <template lang="pug">. layerscope reads only HTML templates, so uses in this template are not checked.',
    ]);
  });

  it('reports a template with a src attribute', () => {
    expect(unread('<template src="./x.html"></template>')).toEqual([
      '<template> Could not read <template src="./x.html">. layerscope does not read a template in a separate file, so uses in it are not checked.',
    ]);
  });

  it('reports `<template src>` with no value', () => {
    expect(unread('<template src></template>')).toEqual([
      '<template> Could not read <template src>. layerscope does not read a template in a separate file, so uses in it are not checked.',
    ]);
  });

  it('reads `<template lang="">` as HTML', () => {
    const scan = scanFile('<template lang=""><CartSummary /></template>', 'a.vue');
    expect(scan.unread).toEqual([]);
    expect(scan.components.map(ref => ref.name)).toEqual(['CartSummary']);
  });

  it('still reads the script of that file', () => {
    const scan = scanFile(
      '<script setup>\nuseCart()\n</script>\n<template lang="pug">\ndiv\n</template>',
      'a.vue',
    );
    expect(scan.unread).toHaveLength(1);
    expect(scan.free.map(ref => ref.name)).toEqual(['useCart']);
  });

  it('points at the template', () => {
    const source = '<script setup>\n</script>\n<template lang="pug">\ndiv\n</template>';
    const [part] = scanFile(source, 'a.vue').unread;
    expect(source.slice(part.offset, part.offset + 6)).toBe('\ndiv\n<');
  });
});

const DYNAMIC = (call: string): string =>
  `${call} Could not read ${call}: the path is not a fixed string. The module that it loads is not checked.`;

describe('a path that is not a fixed string', () => {
  it('reports import() with a template literal that has an expression', () => {
    expect(
      unread(
        'export const load = (a: string) => import(`../../../shop/app/composables/${a}`);\n',
        'a.ts',
      ),
    ).toEqual([DYNAMIC('import()')]);
  });

  it('reports import() with a variable', () => {
    expect(unread('export const load = (a: string) => import(a);\n', 'a.ts')).toEqual([
      DYNAMIC('import()'),
    ]);
  });

  it('reports require() with an expression', () => {
    expect(unread('const a = "x";\nrequire("./" + a);\n', 'a.cjs')).toEqual([DYNAMIC('require()')]);
  });

  it('reports each call on its own', () => {
    expect(unread('import(a);\nimport(b);\nrequire(c);\n', 'a.ts')).toEqual([
      DYNAMIC('import()'),
      DYNAMIC('import()'),
      DYNAMIC('require()'),
    ]);
  });
});

describe('a path that is a fixed string', () => {
  it('reads a template literal without an expression as a fixed string', () => {
    const scan = scanFile(
      'import(`../../../shop/app/composables/useCart`);\nrequire(`./b`);\n',
      'a.ts',
    );
    expect(scan.unread).toEqual([]);
    expect(scan.imports.map(ref => ref.specifier)).toEqual([
      '../../../shop/app/composables/useCart',
      './b',
    ]);
  });

  it('keeps reading a fixed string', () => {
    const scan = scanFile('import("./a");\nrequire("./b");\n', 'a.ts');
    expect(scan.unread).toEqual([]);
    expect(scan.imports).toHaveLength(2);
  });

  it('maps the offset of an import() in a Vue script into the file', () => {
    const source = '<template><div /></template>\n<script setup>\nimport(a);\n</script>';
    const [part] = scanFile(source, 'a.vue').unread;
    expect(source.slice(part.offset, part.offset + 1)).toBe('a');
  });
});

describe('a template literal that is a name, not a path', () => {
  it('keeps `<component :is>` with a template literal as a dynamic component', () => {
    const scan = scanFile('<template><component :is="`div`" /></template>', 'a.vue');
    expect(scan.dynamicComponents).toHaveLength(1);
    expect(scan.components).toEqual([]);
  });

  it('takes resolveComponent() with a template literal with no ${} as that component', () => {
    const scan = scanFile('<script setup>\nresolveComponent(`Foo`)\n</script>', 'a.vue');
    expect(scan.dynamicComponents).toEqual([]);
    expect(scan.components.map(ref => ref.name)).toEqual(['Foo']);
    expect(scan.imports).toEqual([]);
  });

  it('keeps resolveComponent() with a template literal with ${} as a dynamic component', () => {
    const scan = scanFile('<script setup>\nresolveComponent(`Foo${x}`)\n</script>', 'a.vue');
    expect(scan.dynamicComponents).toHaveLength(1);
    expect(scan.components).toEqual([]);
  });
});

describe('import.meta.glob()', () => {
  const GLOB =
    'import.meta.glob() Could not read import.meta.glob(): layerscope does not resolve glob imports. The modules that it loads are not checked.';

  it('is reported', () => {
    expect(unread("export const all = import.meta.glob('./mods/*.ts');\n", 'a.ts')).toEqual([GLOB]);
  });

  it('is reported with an eager option, in a Vue script, once per call', () => {
    expect(
      unread(
        "<script setup>\nimport.meta.glob('./a/*.ts', { eager: true });\nimport.meta.glob(['./b/*.ts']);\n</script>",
      ),
    ).toEqual([GLOB, GLOB]);
  });

  it('does not report `new.target.glob()`', () => {
    expect(unread('export function F() {\n  new.target.glob();\n}\n', 'a.ts')).toEqual([]);
  });

  it('does not report other import.meta members', () => {
    expect(unread('export const url = import.meta.url;\nimport.meta.env.get();\n', 'a.ts')).toEqual(
      [],
    );
  });
});

/** The offset of `text` in `source`; it must be in the source once. */
function at(source: string, text: string): number {
  expect(source.indexOf(text)).toBe(source.lastIndexOf(text));
  return source.indexOf(text);
}

describe('import() in a template', () => {
  it('reads a fixed path as an import, at the path in the template', () => {
    const source = `<template><div @click="() => import('./x')" /></template>`;
    const scan = scanFile(source, 'a.vue');
    expect(scan.unread).toEqual([]);
    expect(scan.imports.map(ref => [ref.specifier, ref.offset])).toEqual([
      ['./x', at(source, "'./x'")],
    ]);
  });

  it('reports a path that is not a fixed string, at the path in the template', () => {
    const source = '<template><div @click="() => import(`./x/${a}`)" /></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports).toEqual([]);
    expect(scan.unread.map(part => [part.symbol, part.message, part.offset])).toEqual([
      [
        'import()',
        'Could not read import(): the path is not a fixed string. The module that it loads is not checked.',
        at(source, '`./x/'),
      ],
    ]);
  });

  it('gives each import() the offset of its own path in the template', () => {
    const source =
      '<template><div @click="() => import(`./a/${a}`)" /><p @click="() => import(b)" /><i @click="() => import(\'./c\')" />{{ import(`./a/${d}`) }}</template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.imports.map(ref => [ref.specifier, ref.offset])).toEqual([
      ['./c', at(source, "'./c'")],
    ]);
    const first = source.indexOf('`./a/');
    expect(scan.unread.map(part => part.offset).toSorted((x, y) => x - y)).toEqual([
      first,
      at(source, 'b)'),
      source.indexOf('`./a/', first + 1),
    ]);
  });

  it('keeps each offset when Vue puts the child before the directive', () => {
    const source = '<template><div v-show="import(`./k/${y}`)">{{ import(a) }}</div></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.unread.map(part => part.offset)).toEqual([at(source, 'a)'), at(source, '`./k/')]);
  });
});

describe('a comment between import and the path in a template', () => {
  it('gives each import() with a comment before the path its own offset', () => {
    const source =
      '<template><div @click="() => import /* a */ (`./a/${x}`)" /><p @click="() => import /* b */ (`./b/${y}`)" /></template>';
    const scan = scanFile(source, 'a.vue');
    expect(scan.unread.map(part => part.offset)).toEqual([
      at(source, '`./a/'),
      at(source, '`./b/'),
    ]);
  });
});
