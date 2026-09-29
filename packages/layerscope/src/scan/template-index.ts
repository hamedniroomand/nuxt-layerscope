export interface TemplateElement {
  tag: string;
  offset: number;
  isAttr: string | null;
  dynamicIs: boolean;
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
  arg?: VueAstNode & { content?: string };
  content?: VueAstNode | string;
}

// compiler-core NodeTypes
const ELEMENT = 1;
const INTERPOLATION = 5;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;

function indexElement(node: VueAstNode, index: TemplateIndex): void {
  let isAttr: string | null = null;
  let dynamicIs = false;
  for (const prop of node.props ?? []) {
    if (prop.type === ATTRIBUTE && prop.name === 'is') {
      isAttr = prop.value?.content ?? null;
    }
    if (prop.type === DIRECTIVE) {
      dynamicIs ||= prop.name === 'bind' && prop.arg?.content === 'is';
      for (const part of [prop.exp, prop.arg]) {
        if (part !== undefined) {
          index.expressions.push([part.loc.start.offset, part.loc.end.offset]);
        }
      }
    }
  }
  index.elements.push({ tag: node.tag ?? '', offset: node.loc.start.offset, isAttr, dynamicIs });
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
