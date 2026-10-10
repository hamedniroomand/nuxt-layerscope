import type { Node } from 'oxc-parser';

import { pascalCase } from '#src/utils/strings.ts';

import { stringLiteral } from './ast.ts';
import { isElementName } from './element-props.ts';
import type { TemplateElement } from './template-index.ts';
import type { FileScan } from './types.ts';

export type Bindings = Record<string, string | undefined>;

export interface RenderContext {
  scan: FileScan;
  bindings: Bindings;
  /** Props whose value can only be a native element name. Read on first use. */
  elementProps: () => Set<string>;
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

/** `$props.X` of a prop in `props`, the way the render function reads a prop. */
function isElementProp(node: Node, props: () => Set<string>): boolean {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    (node.object.name === '$props' || node.object.name === '__props') &&
    node.property.type === 'Identifier' &&
    props().has(node.property.name)
  );
}

/**
 * True when the bound value of `<component :is>` can only be a native HTML or SVG element name.
 * Vue renders such a name as that element, unless a global component has the same name. Nuxt
 * components are not registered globally by default. layerscope cannot follow a global name to a
 * file, so the value gives the user nothing to act on.
 */
function isElementOnly(node: Node | undefined, props: () => Set<string>): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.type === 'Literal') {
    return typeof node.value === 'string' && isElementName(node.value);
  }
  if (node.type === 'ConditionalExpression') {
    return (
      isElementOnly(node.consequent as Node, props) && isElementOnly(node.alternate as Node, props)
    );
  }
  return isElementProp(node, props);
}

function visitDynamicComponent(arg: Node | undefined, ctx: RenderContext): void {
  if (isElementOnly(arg, ctx.elementProps)) {
    return;
  }
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
