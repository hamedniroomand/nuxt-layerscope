import type { Node } from 'oxc-parser';

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

/** `createRequire(...)`, `module.createRequire(...)` or `anything.createRequire(...)`. */
export function isCreateRequire(node: Node | null | undefined): boolean {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const { callee } = node;
  if (callee.type === 'Identifier') {
    return callee.name === 'createRequire';
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'createRequire'
  );
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
