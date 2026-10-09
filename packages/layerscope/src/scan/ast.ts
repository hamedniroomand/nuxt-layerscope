import type { ImportDeclarationSpecifier, Node } from 'oxc-parser';
import type { ScopeTracker } from 'oxc-walker';

export function stringLiteral(node: Node | null | undefined): string | null {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}

export function importedName(spec: Node): string {
  if (spec.type === 'ImportSpecifier') {
    return spec.imported.type === 'Identifier' ? spec.imported.name : String(spec.imported.value);
  }
  return spec.type === 'ImportDefaultSpecifier' ? 'default' : '*';
}

export function reexportedName(spec: Node): string {
  if (spec.type !== 'ExportSpecifier') {
    return '*';
  }
  return spec.local.type === 'Identifier' ? spec.local.name : String(spec.local.value);
}

const MODULE_SOURCES = new Set(['module', 'node:module']);

/** The import that a name was declared by, when it comes from `module` or `node:module`. */
function moduleImport(tracker: ScopeTracker, name: string): ImportDeclarationSpecifier | null {
  const declaration = tracker.getDeclaration(name);
  if (declaration?.type !== 'Import' || !MODULE_SOURCES.has(declaration.importNode.source.value)) {
    return null;
  }
  return declaration.node;
}

/** The callee is `createRequire` of `module`, under any name, or a member of that module. */
function isCreateRequireCallee(callee: Node, tracker: ScopeTracker): boolean {
  if (callee.type === 'Identifier') {
    const imported = moduleImport(tracker, callee.name);
    return (
      imported?.type === 'ImportSpecifier' &&
      imported.imported.type === 'Identifier' &&
      imported.imported.name === 'createRequire'
    );
  }
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object.type !== 'Identifier' ||
    callee.property.type !== 'Identifier' ||
    callee.property.name !== 'createRequire'
  ) {
    return false;
  }
  const { name } = callee.object;
  const imported = moduleImport(tracker, name);
  if (imported === null) {
    // The global `module` of a CommonJS file.
    return name === 'module' && tracker.getDeclaration(name) === null;
  }
  return imported.type !== 'ImportSpecifier';
}

/**
 * `createRequire(...)` imported from `module` or `node:module` (also as `import { createRequire as
 * cr }`), `ns.createRequire(...)` of its namespace or default import, or `module.createRequire(...)`
 * in a CommonJS file. A local function that is called `createRequire` is not one of these.
 */
export function isCreateRequire(node: Node | null | undefined, tracker: ScopeTracker): boolean {
  return node?.type === 'CallExpression' && isCreateRequireCallee(node.callee, tracker);
}

/**
 * The names that `const { a, b } = require('x')` takes from the module, like the names of an
 * import. A plain call, a rest element and a computed key take the whole module.
 */
export function requiredNames(parent: Node | null, call: Node): string[] {
  if (parent?.type !== 'VariableDeclarator' || parent.init !== call) {
    return ['*'];
  }
  const { id } = parent;
  if (id.type !== 'ObjectPattern') {
    return ['*'];
  }
  const names: string[] = [];
  for (const property of id.properties) {
    if (property.type !== 'Property' || property.computed) {
      return ['*'];
    }
    const { key } = property;
    if (key.type === 'Identifier') {
      names.push(key.name);
    } else if (key.type === 'Literal') {
      names.push(String(key.value));
    } else {
      return ['*'];
    }
  }
  return names.length === 0 ? ['*'] : names;
}
