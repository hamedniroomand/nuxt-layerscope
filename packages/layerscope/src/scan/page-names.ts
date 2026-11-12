import type { Node } from 'oxc-parser';
import type { ScopeTracker } from 'oxc-walker';

import { fixedPath } from './ast.ts';
import type { VisitContext } from './script-visitors.ts';
import type { Named } from './types.ts';

/** The modules that export the `setPageLayout` of Nuxt. */
const NUXT_MODULES = new Set(['#imports', '#app', 'nuxt/app']);

/** The value without the wrappers that Nuxt also removes: `('x')`, `'x' as const` and the like. */
function unwrap(node: Node | null | undefined): Node | null | undefined {
  let current = node;
  while (
    current?.type === 'ParenthesizedExpression' ||
    current?.type === 'TSAsExpression' ||
    current?.type === 'TSNonNullExpression' ||
    current?.type === 'TSSatisfiesExpression' ||
    current?.type === 'TSTypeAssertion'
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * The key of a property that is not computed: `layout` or `'layout'`. A method or a getter has a
 * function as its value, which names nothing.
 */
function keyName(property: Node): string | null {
  if (property.type !== 'Property' || property.computed) {
    return null;
  }
  const { key } = property;
  if (key.type === 'Identifier') {
    return key.name;
  }
  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
}

/** Adds the name when the value is a fixed string. Any other value names nothing that is known. */
function addName(names: Named[], node: Node | null | undefined, ctx: VisitContext): void {
  const value = unwrap(node);
  const name = fixedPath(value);
  if (value !== null && value !== undefined && name !== null) {
    names.push({ name, offset: ctx.mapOffset(value.start) });
  }
}

/**
 * `layout: 'x'`, or `layout: { name: 'x', props }`. Nuxt 4.5 and later accept the object, and the
 * scan reads it with each Nuxt version.
 */
function addLayout(node: Node, ctx: VisitContext): void {
  const value = unwrap(node);
  if (value?.type !== 'ObjectExpression') {
    addName(ctx.scan.layouts, value, ctx);
    return;
  }
  for (const property of value.properties) {
    if (property.type === 'Property' && keyName(property) === 'name') {
      addName(ctx.scan.layouts, property.value, ctx);
    }
  }
}

/** `middleware: 'x'`, or a list of names and functions. A function or a spread is not a name. */
function addMiddleware(node: Node, ctx: VisitContext): void {
  const value = unwrap(node);
  const items = value?.type === 'ArrayExpression' ? value.elements : [value];
  for (const item of items) {
    addName(ctx.scan.middleware, item, ctx);
  }
}

function addPageMeta(arg: Node | undefined, ctx: VisitContext): void {
  const meta = unwrap(arg);
  if (meta?.type !== 'ObjectExpression') {
    return;
  }
  for (const property of meta.properties) {
    if (property.type !== 'Property') {
      continue;
    }
    const key = keyName(property);
    if (key === 'layout') {
      addLayout(property.value, ctx);
    } else if (key === 'middleware') {
      addMiddleware(property.value, ctx);
    }
  }
}

/** The auto-import of Nuxt, or an import from Nuxt. A local function of that name is not it. */
function isNuxtFunction(name: string, tracker: ScopeTracker): boolean {
  const declaration = tracker.getDeclaration(name);
  return (
    declaration === null ||
    (declaration.type === 'Import' && NUXT_MODULES.has(declaration.importNode.source.value))
  );
}

/**
 * The layout and route middleware names that a call gives as fixed strings: in
 * `definePageMeta({ layout, middleware })` and in `setPageLayout(name)`. Nuxt finds
 * `definePageMeta()` by its name only, so a local binding does not change it.
 */
export function recordPageNames(callee: string, arg: Node | undefined, ctx: VisitContext): void {
  if (callee === 'definePageMeta') {
    addPageMeta(arg, ctx);
  } else if (callee === 'setPageLayout' && isNuxtFunction(callee, ctx.tracker)) {
    addName(ctx.scan.layouts, arg, ctx);
  }
}
