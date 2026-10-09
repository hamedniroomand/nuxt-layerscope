import type { Node } from 'oxc-parser';
import type { ScopeTracker, ScopeTrackerNode, WalkerThisContextEnter } from 'oxc-walker';
import { isReferenceIdentifier } from 'oxc-walker';

import { importedName, reexportedName, requiredNames, stringLiteral } from './ast.ts';
import type { FileScan, ImportRef, OffsetMapper } from './types.ts';

export interface VisitContext {
  scan: FileScan;
  tracker: ScopeTracker;
  mapOffset: OffsetMapper;
  /** Declarations of the names that `createRequire(...)` was assigned to. */
  requireBindings: Set<ScopeTrackerNode>;
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

/** The global `require`, or a name that `createRequire(...)` was assigned to. */
function isRequireCall(name: string, { tracker, requireBindings }: VisitContext): boolean {
  const declaration = tracker.getDeclaration(name);
  if (declaration === null) {
    return name === 'require';
  }
  // The name must resolve to the binding of `createRequire(...)` here, not to another one.
  return requireBindings.has(declaration);
}

interface Specifier {
  name: string;
  type: boolean;
}

/** `typeOnly` and `typeNames` of a statement, from its `type` keyword and the keywords of its names. */
function typeInfo(
  declaredType: boolean,
  names: string[],
  specifiers: Specifier[],
): Pick<ImportRef, 'typeOnly' | 'typeNames'> {
  if (declaredType) {
    return { typeOnly: true, typeNames: names };
  }
  const values = new Set(specifiers.filter(spec => !spec.type).map(spec => spec.name));
  return {
    typeOnly: specifiers.length > 0 && specifiers.every(spec => spec.type),
    typeNames: specifiers
      .filter(spec => spec.type && !values.has(spec.name))
      .map(spec => spec.name),
  };
}

export const scriptVisitors: Partial<Record<Node['type'], Visitor>> = {
  ImportDeclaration(node, _parent, { scan, mapOffset }) {
    if (node.type !== 'ImportDeclaration') {
      return;
    }
    const names = node.specifiers.length > 0 ? node.specifiers.map(importedName) : ['*'];
    scan.imports.push({
      specifier: node.source.value,
      names,
      ...typeInfo(
        node.importKind === 'type',
        names,
        node.specifiers.map(spec => ({
          name: importedName(spec),
          type: spec.type === 'ImportSpecifier' && spec.importKind === 'type',
        })),
      ),
      offset: mapOffset(node.source.start),
    });
    this.skip();
  },
  ExportNamedDeclaration(node, _parent, { scan, mapOffset }) {
    // Specifiers of a re-export name the other module's exports, not local bindings.
    if (node.type !== 'ExportNamedDeclaration' || !node.source) {
      return;
    }
    const names = node.specifiers.map(reexportedName);
    scan.imports.push({
      specifier: node.source.value,
      names,
      ...typeInfo(
        node.exportKind === 'type',
        names,
        node.specifiers.map(spec => ({
          name: reexportedName(spec),
          type: spec.exportKind === 'type',
        })),
      ),
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
      ...typeInfo(node.exportKind === 'type', ['*'], []),
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
      scan.imports.push({
        specifier,
        names: ['*'],
        typeOnly: false,
        typeNames: [],
        offset: mapOffset(node.source.start),
      });
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
  TSImportEqualsDeclaration(node, _parent, { scan, mapOffset }) {
    // `import x = require('./y')`, the import form of a `.cts` file. `import type x = require()`
    // is type-only.
    if (
      node.type !== 'TSImportEqualsDeclaration' ||
      node.moduleReference.type !== 'TSExternalModuleReference'
    ) {
      return;
    }
    const specifier = stringLiteral(node.moduleReference.expression);
    if (specifier !== null) {
      scan.imports.push({
        specifier,
        names: ['*'],
        ...typeInfo(node.importKind === 'type', ['*'], []),
        offset: mapOffset(node.moduleReference.expression.start),
      });
    }
    this.skip();
  },
  CallExpression(node, parent, ctx) {
    const { scan, mapOffset } = ctx;
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
      return;
    }
    const [arg] = node.arguments as (Node | undefined)[];
    if (isRequireCall(node.callee.name, ctx)) {
      const specifier = stringLiteral(arg);
      if (arg !== undefined && specifier !== null) {
        scan.imports.push({
          specifier,
          names: requiredNames(parent, node),
          typeOnly: false,
          typeNames: [],
          offset: mapOffset(arg.start),
        });
      }
      return;
    }
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
