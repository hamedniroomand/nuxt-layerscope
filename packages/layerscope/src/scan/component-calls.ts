import type { Node } from 'oxc-parser';

import { pascalCase } from '#src/utils/strings.ts';

import { fixedPath } from './ast.ts';
import type { VisitContext } from './script-visitors.ts';

/** The component uses of a call that Nuxt resolves: `h(CartSummary)` and `resolveComponent('x')`. */
export function recordComponentCall(
  callee: string,
  arg: Node | undefined,
  { scan, mapOffset }: VisitContext,
): void {
  if (callee === 'h' && arg?.type === 'Identifier') {
    scan.renderArgs.push({ name: arg.name, offset: mapOffset(arg.start) });
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
