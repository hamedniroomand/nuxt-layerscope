import type { Node } from 'oxc-parser';

import { pascalCase } from '#src/utils/strings.ts';

import { stringLiteral } from './ast.ts';
import type { ElementPropKind } from './element-props.ts';
import { isElementName } from './element-props.ts';
import type { TemplateElement } from './template-index.ts';
import type { FileScan } from './types.ts';

export type Bindings = Record<string, string | undefined>;

export interface RenderContext {
  scan: FileScan;
  bindings: Bindings;
  /** Props whose value can only be a native element name. Read on first use. */
  elementProps: () => Map<string, ElementPropKind>;
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
function propKind(node: Node, props: Map<string, ElementPropKind>): ElementPropKind | null {
  if (
    node.type !== 'MemberExpression' ||
    node.computed ||
    node.object.type !== 'Identifier' ||
    (node.object.name !== '$props' && node.object.name !== '__props') ||
    node.property.type !== 'Identifier'
  ) {
    return null;
  }
  return props.get(node.property.name) ?? null;
}

/**
 * What the bound value of `<component :is>` can be, when it can only be a native HTML or SVG
 * element name: `names` for a literal or a union, `default` for a `string` prop with an element
 * default. `null` for any other value. Vue renders an element name as that element, unless a
 * global component has the same name. Nuxt components are not registered globally by default.
 */
function elementKind(
  node: Node | undefined,
  props: () => Map<string, ElementPropKind>,
): ElementPropKind | null {
  if (node === undefined) {
    return null;
  }
  if (node.type === 'Literal') {
    return typeof node.value === 'string' && isElementName(node.value) ? 'names' : null;
  }
  if (node.type === 'ConditionalExpression') {
    const kinds = [
      elementKind(node.consequent as Node, props),
      elementKind(node.alternate as Node, props),
    ];
    if (kinds.some(kind => kind === null)) {
      return null;
    }
    return kinds.some(kind => kind === 'default') ? 'default' : 'names';
  }
  return propKind(node, props());
}

function visitDynamicComponent(arg: Node | undefined, ctx: RenderContext): void {
  const kind = elementKind(arg, ctx.elementProps);
  if (kind === 'names') {
    return;
  }
  if (kind === 'default') {
    ctx.scan.quietDynamicComponents.push(ctx.elementOffset(el => el.dynamicIs));
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
