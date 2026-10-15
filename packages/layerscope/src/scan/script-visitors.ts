import type { ImportExpression, Node } from 'oxc-parser';
import type { ScopeTracker, ScopeTrackerNode, WalkerThisContextEnter } from 'oxc-walker';
import { isReferenceIdentifier, walk } from 'oxc-walker';

import { fixedPath, importedName, reexportedName, requiredNames, stringLiteral } from './ast.ts';
import { recordComponentCall, recordJsxTag } from './component-calls.ts';
import type { FileScan, ImportRef, OffsetMapper, Unread } from './types.ts';

export interface VisitContext {
  scan: FileScan;
  tracker: ScopeTracker;
  mapOffset: OffsetMapper;
  /** Declarations of the names that `createRequire(...)` was assigned to. */
  requireBindings: Set<ScopeTrackerNode>;
  /**
   * The local names of type-only imports. The scope tracker does not declare them, but they
   * shadow an auto-import of the same name: `import type { useA }` is not the auto-import.
   */
  typeBindings: Set<string>;
}

type Visitor = (
  this: WalkerThisContextEnter,
  node: Node,
  parent: Node | null,
  ctx: VisitContext,
) => void;

/**
 * A `typeof x` in a type is not a runtime reference, so `check` does not count it. It is a use for
 * `unused`: a name with no local binding in the file is recorded in `typeFree`. The check is the
 * one that value identifiers use (`tracker.isDeclared`).
 */
function recordTypeQuery(
  node: Node,
  { scan, tracker, mapOffset, typeBindings }: VisitContext,
): void {
  if (node.type !== 'TSTypeQuery') {
    return;
  }
  let name = node.exprName;
  while (name.type === 'TSQualifiedName') {
    name = name.left;
  }
  if (
    name.type === 'Identifier' &&
    !tracker.isDeclared(name.name) &&
    !typeBindings.has(name.name)
  ) {
    scan.typeFree.push({ name: name.name, offset: mapOffset(name.start) });
  }
}

/**
 * Skips a type, so its names are not read as values, but still finds the `typeof x` in it. The
 * scope tracker does not enter the type, so a name that the type declares itself (a parameter of a
 * function type, a `namespace` member) is not known here and counts as a use of the auto-import of
 * the same name. The same holds for an `import type` inside `declare module` or `declare global`:
 * only the imports of the file itself shadow. This is rare, and it can only hide an entry from
 * the list, never add one.
 */
function skipType(
  this: WalkerThisContextEnter,
  node: Node,
  _parent: Node | null,
  ctx: VisitContext,
): void {
  walk(node, {
    enter(inner) {
      recordTypeQuery(inner, ctx);
    },
  });
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
): Pick<ImportRef, 'typeOnly' | 'typeStatement' | 'typeNames'> {
  if (declaredType) {
    return { typeOnly: true, typeStatement: true, typeNames: names };
  }
  const values = new Set(specifiers.filter(spec => !spec.type).map(spec => spec.name));
  return {
    typeOnly: specifiers.length > 0 && specifiers.every(spec => spec.type),
    typeNames: specifiers
      .filter(spec => spec.type && !values.has(spec.name))
      .map(spec => spec.name),
  };
}

function isImportMetaGlob(callee: Node): boolean {
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'MetaProperty' &&
    callee.object.meta.name === 'import' &&
    callee.object.property.name === 'meta' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'glob'
  );
}

function dynamicPath(call: 'import()' | 'require()', offset: number): Unread {
  return {
    symbol: call,
    reason: `${call} with a dynamic path`,
    message: `Could not read ${call}: the path is not a fixed string. The module that it loads is not checked.`,
    offset,
  };
}

/** An `import()` with a fixed path is an import. Any other path is code that layerscope cannot read. */
export function recordImportCall(node: ImportExpression, scan: FileScan, offset: number): void {
  const specifier = fixedPath(node.source);
  if (specifier === null) {
    scan.unread.push(dynamicPath('import()', offset));
  } else {
    scan.imports.push({ specifier, names: ['*'], typeOnly: false, typeNames: [], offset });
  }
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
    if (node.type === 'ImportExpression') {
      recordImportCall(node, scan, mapOffset(node.source.start));
    }
  },
  // Type-only syntax has no runtime references: `[id: string]`, `(...next: T[]) => void`. It is
  // skipped, but a `typeof x` inside it is a use for `unused`.
  TSModuleDeclaration: skipType,
  TSImportType: skipType,
  TSTypeQuery: skipType,
  TSNamedTupleMember: skipType,
  TSFunctionType: skipType,
  TSConstructorType: skipType,
  TSMethodSignature: skipType,
  TSCallSignatureDeclaration: skipType,
  TSConstructSignatureDeclaration: skipType,
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
        require: true,
        offset: mapOffset(node.moduleReference.expression.start),
      });
    }
    this.skip();
  },
  CallExpression(node, parent, ctx) {
    const { scan, mapOffset } = ctx;
    if (node.type !== 'CallExpression') {
      return;
    }
    if (isImportMetaGlob(node.callee)) {
      scan.unread.push({
        symbol: 'import.meta.glob()',
        reason: 'import.meta.glob()',
        message:
          'Could not read import.meta.glob(): layerscope does not resolve glob imports. The modules that it loads are not checked.',
        offset: mapOffset(node.start),
      });
      return;
    }
    if (node.callee.type !== 'Identifier') {
      return;
    }
    const [arg] = node.arguments as (Node | undefined)[];
    if (isRequireCall(node.callee.name, ctx)) {
      const specifier = fixedPath(arg);
      if (arg !== undefined && specifier !== null) {
        scan.imports.push({
          specifier,
          names: requiredNames(parent, node),
          typeOnly: false,
          typeNames: [],
          require: true,
          offset: mapOffset(arg.start),
        });
      } else if (arg !== undefined) {
        scan.unread.push(dynamicPath('require()', mapOffset(arg.start)));
      }
      return;
    }
    recordComponentCall(node.callee.name, arg, ctx);
  },
  JSXOpeningElement(node, _parent, ctx) {
    recordJsxTag(node, ctx);
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
