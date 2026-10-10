// `vue` does not re-export the tag helpers, so they come from `@vue/shared`, the same version.
// eslint-disable-next-line vue/prefer-import-from-vue -- no export of these helpers in `vue`
import { isHTMLTag, isSVGTag } from '@vue/shared';
import { parseSync } from 'oxc-parser';

import type { Lang } from './types.ts';

/**
 * An AST node read by its `type` and its keys. The parser types are too wide to narrow one key at
 * a time, so the reads below check each value before they use it.
 */
type Loose = { type: string; [key: string]: unknown };

function isLoose(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && typeof (value as Loose).type === 'string';
}

function child(node: Loose, key: string): Loose | undefined {
  const value = node[key];
  return isLoose(value) ? value : undefined;
}

function childrenOf(node: Loose, key: string): Loose[] {
  const value = node[key];
  return Array.isArray(value) ? value.filter(item => isLoose(item)) : [];
}

function nameOf(node: Loose | undefined): string | null {
  if (node?.type === 'Identifier' && typeof node.name === 'string') {
    return node.name;
  }
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}

/** A native HTML or SVG element name. Vue reads it as an element, not as a component. */
export function isElementName(name: string): boolean {
  return isHTMLTag(name) || isSVGTag(name);
}

/**
 * `names`: the prop is a literal union of element names, so no parent can pass a component name.
 * `default`: a `string` prop with an element default. A parent can still pass a global name.
 */
export type ElementPropKind = 'names' | 'default';

export interface ElementProps {
  /** The kind of each element-only prop, by name. */
  kinds: Map<string, ElementPropKind>;
  /** Names of variables that hold the props, as in `const props = defineProps(...)`. */
  holders: Set<string>;
}

interface PropsCall {
  /** The type argument of `defineProps<...>()`. */
  type: Loose | undefined;
  /** The object of `withDefaults(..., { ... })`, when given. */
  defaults: Loose | undefined;
}

/** `defineProps<T>()`, or `withDefaults(defineProps<T>(), { ... })`; `null` for any other call. */
function propsCallOf(node: unknown): PropsCall | null {
  if (!isLoose(node) || node.type !== 'CallExpression') {
    return null;
  }
  const callee = child(node, 'callee');
  if (callee?.type !== 'Identifier') {
    return null;
  }
  const typeArguments = child(node, 'typeArguments');
  const type = childrenOf(typeArguments ?? { type: '', params: [] }, 'params')[0];
  if (callee.name === 'defineProps') {
    return { type, defaults: undefined };
  }
  const args = childrenOf(node, 'arguments');
  const props = propsCallOf(args[0]);
  const defaults: Loose | undefined = args[1];
  return callee.name === 'withDefaults' && props !== null ? { type: props.type, defaults } : null;
}

/** The string defaults of an object expression or an object pattern: `{ tag: 'span' }`. */
function stringDefaults(node: Loose | undefined): Map<string, string> {
  const defaults = new Map<string, string>();
  for (const property of childrenOf(node ?? { type: '', properties: [] }, 'properties')) {
    const key = nameOf(child(property, 'key'));
    const value = child(property, 'value');
    // A destructured default is an assignment pattern: `{ tag = 'span' }`.
    const literal = value?.type === 'AssignmentPattern' ? child(value, 'right') : value;
    const text = literal?.type === 'Literal' ? literal.value : undefined;
    if (key !== null && typeof text === 'string') {
      defaults.set(key, text);
    }
  }
  return defaults;
}

/** The members of a props type, from an inline literal or an interface or alias of this file. */
function membersOf(type: Loose | undefined, members: Map<string, Loose[]>): Loose[] {
  if (type?.type === 'TSTypeLiteral') {
    return childrenOf(type, 'members');
  }
  const name = type?.type === 'TSTypeReference' ? nameOf(child(type, 'typeName')) : null;
  return name === null ? [] : (members.get(name) ?? []);
}

/**
 * The names of a literal type, or of a union of literal types; `null` for any other type. A name
 * of a type alias of this file is followed once. The alias itself is not followed again, so a loop
 * of aliases ends.
 */
function literalNames(
  type: Loose | undefined,
  aliases: Map<string, Loose>,
  follow = true,
): string[] | null {
  if (type?.type === 'TSLiteralType') {
    const literal = child(type, 'literal')?.value;
    return typeof literal === 'string' ? [literal] : null;
  }
  if (type?.type === 'TSTypeReference' && follow) {
    const name = nameOf(child(type, 'typeName'));
    const alias = name === null ? undefined : aliases.get(name);
    return alias === undefined ? null : literalNames(alias, aliases, false);
  }
  if (type?.type !== 'TSUnionType') {
    return null;
  }
  const names: string[] = [];
  for (const part of childrenOf(type, 'types')) {
    const partNames = literalNames(part, aliases, follow);
    if (partNames === null) {
      return null;
    }
    names.push(...partNames);
  }
  return names;
}

/** The types of this module that a props type can name: members, and type aliases. */
interface Declared {
  /** Members of interfaces, and of type aliases of an object type. */
  members: Map<string, Loose[]>;
  /** The right-hand side of every type alias. */
  aliases: Map<string, Loose>;
}

/** The interfaces and the type aliases at the top of the module. */
function declaredTypes(body: Loose[]): Declared {
  const declared: Declared = { members: new Map(), aliases: new Map() };
  for (const statement of body) {
    const node =
      statement.type === 'ExportNamedDeclaration' ? child(statement, 'declaration') : statement;
    const name = nameOf(node === undefined ? undefined : child(node, 'id'));
    if (node?.type === 'TSInterfaceDeclaration' && name !== null) {
      declared.members.set(name, childrenOf(child(node, 'body') ?? node, 'body'));
    } else if (node?.type === 'TSTypeAliasDeclaration' && name !== null) {
      const type = child(node, 'typeAnnotation');
      if (type !== undefined) {
        declared.aliases.set(name, type);
      }
      if (type?.type === 'TSTypeLiteral') {
        declared.members.set(name, childrenOf(type, 'members'));
      }
    }
  }
  return declared;
}

/** The element-only props of one `defineProps` call, added to `result`. */
function addElementOnly(
  call: PropsCall,
  pattern: Loose | undefined,
  declared: Declared,
  result: Map<string, ElementPropKind>,
): void {
  // A destructure default and a withDefaults default are read the same way.
  const defaults = new Map([
    ...stringDefaults(call.defaults),
    ...stringDefaults(pattern?.type === 'ObjectPattern' ? pattern : undefined),
  ]);
  for (const member of membersOf(call.type, declared.members)) {
    const name = nameOf(child(member, 'key'));
    const holder = child(member, 'typeAnnotation');
    const type = holder === undefined ? undefined : child(holder, 'typeAnnotation');
    const names = literalNames(type, declared.aliases);
    const fallback = name === null ? undefined : defaults.get(name);
    if (name === null) {
      continue;
    }
    if (names !== null && names.length > 0 && names.every(entry => isElementName(entry))) {
      result.set(name, 'names');
    } else if (
      type?.type === 'TSStringKeyword' &&
      fallback !== undefined &&
      isElementName(fallback)
    ) {
      result.set(name, 'default');
    }
  }
}

/**
 * The props that can only hold a native element name, so `<component :is>` on them names no
 * component. A literal union of element names does. A `string` prop does when its default is an
 * element name. A `string` prop with no such default, and any type that is not read here, does not.
 */
export function elementOnlyProps(code: string, lang: Lang): ElementProps {
  const kinds = new Map<string, ElementPropKind>();
  const holders = new Set<string>();
  const { program, errors } = parseSync(`file.${lang}`, code, { lang });
  if (errors.length > 0) {
    return { kinds, holders };
  }
  const body = childrenOf(program as unknown as Loose, 'body');
  const declared = declaredTypes(body);
  for (const statement of body) {
    const declarators = childrenOf(statement, 'declarations');
    for (const declarator of declarators) {
      const call = propsCallOf(child(declarator, 'init'));
      const id = child(declarator, 'id');
      if (call !== null) {
        addElementOnly(call, id, declared, kinds);
        // `const props = defineProps(...)`: the template reads `props.tag`. A destructure has no name.
        const holder = id?.type === 'Identifier' ? nameOf(id) : null;
        if (holder !== null) {
          holders.add(holder);
        }
      }
    }
    const call = propsCallOf(child(statement, 'expression'));
    if (call !== null) {
      addElementOnly(call, undefined, declared, kinds);
    }
  }
  return { kinds, holders };
}
