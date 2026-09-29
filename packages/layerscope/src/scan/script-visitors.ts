import type { Node } from 'oxc-parser';
import type { ScopeTracker, WalkerThisContextEnter } from 'oxc-walker';
import { isReferenceIdentifier } from 'oxc-walker';

import { importedName, reexportedName, stringLiteral } from './ast.ts';
import type { FileScan, OffsetMapper } from './types.ts';

export interface VisitContext {
  scan: FileScan;
  tracker: ScopeTracker;
  mapOffset: OffsetMapper;
}

type Visitor = (
  this: WalkerThisContextEnter,
  node: Node,
  parent: Node | null,
  ctx: VisitContext,
) => void;

function skip(this: WalkerThisContextEnter): void {
  this.skip();
}

export const scriptVisitors: Partial<Record<Node['type'], Visitor>> = {
  ImportDeclaration(node, _parent, { scan, mapOffset }) {
    if (node.type !== 'ImportDeclaration') {
      return;
    }
    scan.imports.push({
      specifier: node.source.value,
      names: node.specifiers.length > 0 ? node.specifiers.map(importedName) : ['*'],
      offset: mapOffset(node.source.start),
    });
    this.skip();
  },
  ExportNamedDeclaration(node, _parent, { scan, mapOffset }) {
    // Specifiers of a re-export name the other module's exports, not local bindings.
    if (node.type !== 'ExportNamedDeclaration' || !node.source) {
      return;
    }
    scan.imports.push({
      specifier: node.source.value,
      names: node.specifiers.map(reexportedName),
      offset: mapOffset(node.source.start),
    });
    this.skip();
  },
  ExportAllDeclaration(node, _parent, { scan, mapOffset }) {
    if (node.type !== 'ExportAllDeclaration') {
      return;
    }
    scan.imports.push({
      specifier: node.source.value,
      names: ['*'],
      offset: mapOffset(node.source.start),
    });
    this.skip();
  },
  ImportExpression(node, _parent, { scan, mapOffset }) {
    if (node.type !== 'ImportExpression') {
      return;
    }
    const specifier = stringLiteral(node.source);
    if (specifier !== null) {
      scan.imports.push({ specifier, names: ['*'], offset: mapOffset(node.source.start) });
    }
  },
  TSModuleDeclaration: skip,
  TSImportType: skip,
  // Type-only syntax has no runtime references: `typeof x`, `[id: string]`, `(...next: T[]) => void`.
  TSTypeQuery: skip,
  TSNamedTupleMember: skip,
  TSFunctionType: skip,
  TSConstructorType: skip,
  TSMethodSignature: skip,
  TSCallSignatureDeclaration: skip,
  TSConstructSignatureDeclaration: skip,
  CallExpression(node, _parent, { scan, mapOffset }) {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
      return;
    }
    const [arg] = node.arguments as (Node | undefined)[];
    if (node.callee.name !== 'resolveComponent' || arg === undefined) {
      return;
    }
    const name = stringLiteral(arg);
    if (name === null) {
      scan.dynamicComponents.push(mapOffset(arg.start));
    } else {
      scan.components.push({ name, offset: mapOffset(arg.start) });
    }
  },
  Identifier(node, parent, { scan, tracker, mapOffset }) {
    if (
      node.type === 'Identifier' &&
      isReferenceIdentifier(node, parent) &&
      !tracker.isDeclared(node.name)
    ) {
      scan.free.push({ name: node.name, offset: mapOffset(node.start) });
    }
  },
};
