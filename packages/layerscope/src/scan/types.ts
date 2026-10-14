/** References found in one source file. Offsets point into the original file. */
export interface FileScan {
  /** Identifiers without a local binding. */
  free: Named[];
  /** The names in `typeof x` in a type that have no local binding: uses in a type position. */
  typeFree: Named[];
  /** Identifiers a template reads from the component instance (`_ctx.x`). */
  templateIdents: Named[];
  components: Named[];
  /**
   * The identifiers that are the first argument of `h()`, as in `h(CartSummary)`. In a `.vue`,
   * `.jsx` or `.tsx` file, Nuxt changes such a name to its component by its text, whatever binds it.
   */
  renderArgs: Named[];
  /**
   * The names in `<NuxtIsland name="X">`. A name that is not in the symbol table gives no finding:
   * the generated .d.ts files do not list island components.
   */
  islands: Named[];
  /** Offsets of `<component :is>` bound to a runtime value. */
  dynamicComponents: number[];
  /**
   * Offsets of runtime component choices that give no finding: `<component :is>` bound to a
   * `string` prop with an element default (a parent can still pass a global component name),
   * `<NuxtIsland :name>` and `resolveDynamicComponent(x)`. The file still counts as a user.
   */
  quietDynamicComponents: number[];
  imports: ImportRef[];
  /** Parts of the file that layerscope cannot read. Everything else in the file is still scanned. */
  unread: Unread[];
  /** Set when the file could not be parsed; nothing else in it was analyzed. */
  error: { message: string; offset: number } | null;
}

export interface Unread {
  /** Short name of the part, for the finding: `<template>`, `<script>`, `import()` or `require()`. */
  symbol: string;
  message: string;
  /** Short cause, for the `unused` report: `import() with a dynamic path`. */
  reason: string;
  offset: number;
}

export interface Named {
  name: string;
  offset: number;
}

export interface ImportRef {
  specifier: string;
  /** Export names, with `default` and `*` for default and namespace imports. */
  names: string[];
  /**
   * layerscope treats the statement as type-only: `import type`, or a `type` keyword on every
   * name. An inline `type` keyword can still leave a side-effect import in the output, under
   * `verbatimModuleSyntax`.
   */
  typeOnly: boolean;
  /**
   * The statement itself has the `type` keyword: `import type`, `export type`, `export type *` or
   * `import type x = require()`. Only such a statement never loads the module at runtime.
   */
  typeStatement?: boolean;
  /** The module loads through `require()`: a `require()` call or `import x = require()`. */
  require?: boolean;
  /** The names in `names` that only a `type` keyword brings in; a name that a value also brings is not in it. */
  typeNames: string[];
  offset: number;
}

export type Lang = 'js' | 'jsx' | 'ts' | 'tsx';

export type OffsetMapper = (offset: number) => number;

export function emptyScan(): FileScan {
  return {
    free: [],
    typeFree: [],
    templateIdents: [],
    components: [],
    renderArgs: [],
    islands: [],
    dynamicComponents: [],
    quietDynamicComponents: [],
    imports: [],
    unread: [],
    error: null,
  };
}

export function toLang(lang: string | undefined): Lang {
  return lang === 'ts' || lang === 'tsx' || lang === 'jsx' ? lang : 'js';
}
