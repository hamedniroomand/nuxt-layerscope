import globals from 'globals';
import type { Node } from 'oxc-parser';

import { pascalCase } from '#src/utils/strings.ts';

import { fixedPath } from './ast.ts';
import { isElementName } from './element-props.ts';
import type { VisitContext } from './script-visitors.ts';

/**
 * The component uses of a call that Nuxt resolves, `h(CartSummary)` and `resolveComponent('x')`,
 * and of `resolveDynamicComponent(x)`.
 */
export function recordComponentCall(
  callee: string,
  arg: Node | undefined,
  { scan, mapOffset }: VisitContext,
): void {
  if (callee === 'h' && arg?.type === 'Identifier') {
    scan.renderArgs.push({ name: arg.name, offset: mapOffset(arg.start) });
    return;
  }
  if (callee === 'resolveDynamicComponent' && arg !== undefined) {
    // Nuxt does not rewrite `resolveDynamicComponent`, so a fixed name reaches only a global
    // component. A value chosen at runtime makes the file a user of runtime components.
    if (fixedPath(arg) === null) {
      scan.quietDynamicComponents.push(mapOffset(arg.start));
    }
    return;
  }
  if (callee !== 'resolveComponent' || arg === undefined) {
    return;
  }
  // Nuxt takes a quoted name, also in backticks, and changes it to PascalCase: `'cart-summary'`.
  const name = fixedPath(arg);
  if (name === null) {
    scan.dynamicComponents.push(mapOffset(arg.start));
  } else {
    scan.components.push({ name: pascalCase(name), offset: mapOffset(arg.start) });
  }
}

/**
 * The names that Babel's `scope.hasBinding()` gives as bound with no declaration: the JavaScript
 * globals and `arguments` and `undefined`. The JSX plugin compiles `<Map />` to `Map` for them.
 */
const JS_GLOBALS = new Set([...Object.keys(globals.builtin), 'arguments', 'undefined']);

/**
 * A JSX tag that Vue's JSX plugin compiles to `resolveComponent()`, as its `getTag()` does: a plain
 * name that is not an HTML or SVG element, not `Fragment`, not a local binding and not a JavaScript
 * global. A member tag (`<Ui.Card>`) or a namespaced tag (`<svg:a>`) is not one.
 */
export function recordJsxTag(node: Node, { scan, tracker, mapOffset }: VisitContext): void {
  if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier') {
    return;
  }
  const { name } = node.name;
  const bound = tracker.isDeclared(name) || JS_GLOBALS.has(name);
  if (isElementName(name) || name === 'Fragment' || bound) {
    return;
  }
  scan.jsxTags.push({ name: pascalCase(name), offset: mapOffset(node.name.start) });
}
