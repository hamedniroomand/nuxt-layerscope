import { describe, expect, it } from 'vite-plus/test';

import { scanModule } from '#src/scan/script.ts';

interface Found {
  specifier: string;
  names: string[];
}

function required(code: string, file = 'file.ts'): Found[] {
  return scanModule(code, file).imports.map(({ specifier, names }) => ({ specifier, names }));
}

describe('require() in a script', () => {
  it('is an import of the whole module, like import() with a literal', () => {
    expect(required("const a = require('./a'); import('./b');")).toEqual([
      { specifier: './a', names: ['*'] },
      { specifier: './b', names: ['*'] },
    ]);
  });

  it('takes the names of a destructuring, as named imports have them', () => {
    expect(required("const { useCart, cartStore } = require('#layers/web/cart');")).toEqual([
      { specifier: '#layers/web/cart', names: ['useCart', 'cartStore'] },
    ]);
    expect(required("const { a: renamed, 'b-c': other } = require('./x');")).toEqual([
      { specifier: './x', names: ['a', 'b-c'] },
    ]);
  });

  it.each([
    ['a rest element', "const { a, ...rest } = require('./x');"],
    ['a computed key', "const { [key]: a } = require('./x');"],
    ['a binding that is not a destructuring', "const all = require('./x');"],
    ['an empty destructuring', "const {} = require('./x');"],
    ['a call in an expression', "use(require('./x'));"],
    ['a member of the module', "const a = require('./x').a;"],
  ])('takes the whole module for %s', (_label, code) => {
    expect(required(code)).toEqual([{ specifier: './x', names: ['*'] }]);
  });

  it('gives nothing for an argument that is not a string literal', () => {
    expect(required('require(name); require(`./${name}`); require();')).toEqual([]);
  });

  it('does not count require.resolve', () => {
    expect(required("const path = require.resolve('./x');")).toEqual([]);
  });

  it('ignores a require that is declared in the file', () => {
    expect(required("function require(name) { return name; } require('./x');")).toEqual([]);
    expect(required("const run = (require) => require('./x');")).toEqual([]);
  });
});

const IMPORT = "import { createRequire } from 'node:module';\n";
const ONE = [{ specifier: './a', names: ['*'] }];

describe('createRequire', () => {
  it('counts the call of a binding that createRequire gave, whatever its name', () => {
    const code = `${IMPORT}
      const load = createRequire(import.meta.url);
      const require = createRequire(import.meta.url);
      load('./a');
      require('./b');
    `;
    expect(required(code, 'file.mjs')).toEqual([
      { specifier: 'node:module', names: ['createRequire'] },
      { specifier: './a', names: ['*'] },
      { specifier: './b', names: ['*'] },
    ]);
  });

  it('knows createRequire of a namespace or default import, and the global module', () => {
    const call = "const r = mod.createRequire(import.meta.url); r('./a');";
    const ns = required(`import * as mod from 'node:module';\n${call}`, 'file.mjs');
    const dflt = required(`import mod from 'module';\n${call}`, 'file.mjs');
    const global = required("const r = module.createRequire(__filename); r('./a');", 'file.cjs');
    expect(ns.slice(1)).toEqual(ONE);
    expect(dflt.slice(1)).toEqual(ONE);
    expect(global).toEqual(ONE);
  });

  it('knows createRequire under another name', () => {
    const code = "import { createRequire as cr } from 'node:module';\nconst r = cr(url); r('./a');";
    expect(required(code, 'file.mjs').slice(1)).toEqual(ONE);
  });

  it('finds a call that comes before the declaration in the file', () => {
    const code = `${IMPORT}function run() { load('./a'); }\nconst load = createRequire(import.meta.url);`;
    expect(required(code, 'file.mjs').slice(1)).toEqual(ONE);
  });
});

describe('createRequire that is not from module', () => {
  it('does not know a local function that is called createRequire', () => {
    const code =
      "function createRequire(url) { return url; }\nconst r = createRequire(url); r('./a');";
    expect(required(code, 'file.mjs')).toEqual([]);
  });

  it('does not know createRequire imported from another file', () => {
    const code =
      "import { createRequire } from './helpers';\nconst r = createRequire(url); r('./a');";
    expect(required(code, 'file.mjs').map(item => item.specifier)).toEqual(['./helpers']);
  });

  it('does not know a member of another module or of a local object', () => {
    const other = "import mod from './mod';\nconst r = mod.createRequire(url); r('./a');";
    expect(required(other, 'file.mjs').map(item => item.specifier)).toEqual(['./mod']);
    expect(required("const r = tools.createRequire(url); r('./a');", 'file.mjs')).toEqual([]);
  });

  it('does not follow a binding that createRequire did not give', () => {
    expect(required("const load = makeLoader(); load('./a');")).toEqual([]);
  });
});

describe('createRequire and scope', () => {
  it('does not take a parameter or an inner binding with the same name', () => {
    const code = `${IMPORT}
      const load = createRequire(import.meta.url);
      function inner(load) { load('./param'); }
      function other() { const load = makeLoader(); load('./inner'); }
      load('./outer');
    `;
    expect(required(code, 'file.mjs').slice(1)).toEqual([{ specifier: './outer', names: ['*'] }]);
  });

  it('does not take a binding outside the function that holds it', () => {
    const code = `${IMPORT}
      function setup() { const load = createRequire(import.meta.url); load('./in'); }
      load('./out');
    `;
    expect(required(code, 'file.mjs').slice(1)).toEqual([{ specifier: './in', names: ['*'] }]);
  });
});

describe('a CommonJS file', () => {
  it('is parsed as CommonJS, so a top-level return is valid', () => {
    const code = "if (!process.env.X) { return; }\nconst a = require('./a');\nmodule.exports = a;";
    const scan = scanModule(code, 'helper.cjs');
    expect(scan.error).toBeNull();
    expect(scan.imports).toHaveLength(1);
    expect(scan.free.map(ref => ref.name)).toEqual(['process', 'require', 'module']);
  });

  it('scans a .cts file with types', () => {
    const scan = scanModule("const a: string = require('./a');", 'helper.cts');
    expect(scan.error).toBeNull();
    expect(scan.imports).toEqual([expect.objectContaining({ specifier: './a' })]);
  });
});

describe('import x = require()', () => {
  it('is an import of the whole module, in a .cts file', () => {
    const scan = scanModule("import fs = require('./y');\nexport = fs;", 'helper.cts');
    expect(scan.error).toBeNull();
    expect(scan.imports).toEqual([expect.objectContaining({ specifier: './y', names: ['*'] })]);
  });

  it('is treated like import type: it is an import as well', () => {
    const code = "import type { A } from './a';\nimport type b = require('./b');";
    expect(required(code, 'helper.cts').map(item => item.specifier)).toEqual(['./a', './b']);
  });

  it('ignores a namespace alias, which is not a module reference', () => {
    expect(required('import Alias = Some.Namespace.Name;', 'helper.cts')).toEqual([]);
  });
});
