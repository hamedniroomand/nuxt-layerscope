import type { Node } from 'oxc-parser';

import { pascalCase } from '#src/utils/strings.ts';

import { fixedPath } from './ast.ts';
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
