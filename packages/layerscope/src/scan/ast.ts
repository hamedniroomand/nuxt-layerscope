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
