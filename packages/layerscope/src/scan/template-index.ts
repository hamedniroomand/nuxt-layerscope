import { pascalCase } from '#src/utils/strings.ts';

export interface TemplateElement {
  tag: string;
  offset: number;
  isAttr: string | null;
  dynamicIs: boolean;
  /** `<NuxtIsland name="X">`: the island component name, as written. */
  islandName: string | null;
  /** `<NuxtIsland :name>`: the island is chosen at runtime. */
  dynamicIslandName: boolean;
}

export interface TemplateIndex {
  elements: TemplateElement[];
  /** `[start, end]` offsets of template expressions. */
  expressions: [number, number][];
}

/** The subset of compiler-core's template AST this module reads. */
export interface VueAstNode {
  type: number;
  tag?: string;
  loc: { start: { offset: number }; end: { offset: number } };
  children?: VueAstNode[];
  props?: VueAstNode[];
  name?: string;
  value?: { content: string };
  exp?: VueAstNode;
  arg?: VueAstNode & { content?: string; isStatic?: boolean };
  content?: VueAstNode | string;
}

// compiler-core NodeTypes
const ELEMENT = 1;
const INTERPOLATION = 5;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;

function isBind(prop: VueAstNode, arg: string): boolean {
  return prop.name === 'bind' && prop.arg?.content === arg;
}

/** A `v-bind` that can set the `name` prop: `:name`, `v-bind="obj"` or `v-bind:[key]`. */
function bindsName(prop: VueAstNode): boolean {
  if (prop.type !== DIRECTIVE || prop.name !== 'bind') {
    return false;
  }
  return prop.arg === undefined || prop.arg.isStatic === false || prop.arg.content === 'name';
}

/**
 * The `name` of a `<NuxtIsland>`: the static value, and whether a `v-bind` can set it at runtime.
 * Such a `v-bind` marks the name as chosen at runtime also when a static `name` is there.
 */
function islandOf(node: VueAstNode): Pick<TemplateElement, 'islandName' | 'dynamicIslandName'> {
  let islandName: string | null = null;
  let dynamicIslandName = false;
  if (pascalCase(node.tag ?? '') === 'NuxtIsland') {
    for (const prop of node.props ?? []) {
      if (prop.type === ATTRIBUTE && prop.name === 'name') {
        islandName = prop.value?.content ?? null;
      }
      dynamicIslandName ||= bindsName(prop);
    }
  }
  return { islandName, dynamicIslandName };
}

function indexElement(node: VueAstNode, index: TemplateIndex): void {
  let isAttr: string | null = null;
  let dynamicIs = false;
  for (const prop of node.props ?? []) {
    if (prop.type === ATTRIBUTE && prop.name === 'is') {
      isAttr = prop.value?.content ?? null;
    }
    if (prop.type === DIRECTIVE) {
      dynamicIs ||= isBind(prop, 'is');
      for (const part of [prop.exp, prop.arg]) {
        if (part !== undefined) {
          index.expressions.push([part.loc.start.offset, part.loc.end.offset]);
        }
      }
    }
  }
  index.elements.push({
    tag: node.tag ?? '',
    offset: node.loc.start.offset,
    isAttr,
    dynamicIs,
    ...islandOf(node),
  });
}

/** Element and expression positions, to point findings back at the source template. */
export function indexTemplate(root: VueAstNode): TemplateIndex {
  const index: TemplateIndex = { elements: [], expressions: [] };
  const visit = (node: VueAstNode): void => {
    if (node.type === ELEMENT) {
      indexElement(node, index);
    }
    if (node.type === INTERPOLATION && typeof node.content === 'object') {
      index.expressions.push([node.content.loc.start.offset, node.content.loc.end.offset]);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(root);
  return index;
}
