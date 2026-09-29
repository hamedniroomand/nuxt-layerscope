import type { Node } from 'oxc-parser';

import { pascalCase } from '#src/utils/strings.ts';

import { stringLiteral } from './ast.ts';
import type { TemplateElement } from './template-index.ts';
import type { FileScan } from './types.ts';

export type Bindings = Record<string, string | undefined>;

export interface RenderContext {
  scan: FileScan;
  bindings: Bindings;
  elementOffset: (predicate: (el: TemplateElement) => boolean) => number;
  identOffset: (name: string) => number;
}

/** `$setup.X` where X is a const binding, such as an imported component. */
function isSetupConst(arg: Node | undefined, bindings: Bindings): boolean {
  if (arg?.type !== 'MemberExpression' || arg.object.type !== 'Identifier') {
    return false;
  }
  if (arg.object.name !== '$setup') {
    return false;
  }
  const key =
    arg.property.type === 'Identifier' && !arg.computed
      ? arg.property.name
      : stringLiteral(arg.property as Node);
  return key !== null && bindings[key] === 'setup-const';
}

function visitDynamicComponent(arg: Node | undefined, ctx: RenderContext): void {
  const literal = stringLiteral(arg);
  if (literal !== null) {
    ctx.scan.components.push({
      name: pascalCase(literal),
      offset: ctx.elementOffset(el => el.isAttr === literal),
    });
  } else if (!isSetupConst(arg, ctx.bindings)) {
    ctx.scan.dynamicComponents.push(ctx.elementOffset(el => el.dynamicIs));
  }
}

export function visitRenderCall(node: Node, ctx: RenderContext): void {
  if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
    return;
  }
  const arg = node.arguments[0] as Node | undefined;
  const literal = stringLiteral(arg);
  if (node.callee.name === '_resolveComponent' && literal !== null) {
    const name = pascalCase(literal);
    ctx.scan.components.push({
      name,
      offset: ctx.elementOffset(el => pascalCase(el.tag) === name),
    });
  } else if (node.callee.name === '_resolveDynamicComponent') {
    visitDynamicComponent(arg, ctx);
  }
}

export function visitRenderMember(node: Node, ctx: RenderContext): void {
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === '_ctx' &&
    node.property.type === 'Identifier'
  ) {
    const { name } = node.property;
    ctx.scan.templateIdents.push({ name, offset: ctx.identOffset(name) });
  }
}
