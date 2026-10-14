import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { SymbolTarget } from '#src/nuxt/symbols.ts';
import type { FileScan, ImportRef, Named } from '#src/scan/types.ts';
import type {
  Context,
  Edge,
  Finding,
  Layer,
  Reference,
  ReferenceKind,
  Severity,
  TypeImports,
} from '#src/types.ts';
import { lineColumn } from '#src/utils/position.ts';

import { CONTEXTS, contextOf } from './files.ts';
import type { ImportEnv, ImportOutcome, ImportTarget } from './import-refs.ts';
import { isIgnored, lookupAutoImports, outcomesOf } from './import-refs.ts';

/** Runtime registrations (plugins, `app.component`, `vueApp.use`) are invisible statically. */
const GLOBALS_HINT = 'if it is registered at runtime, add it to "globals" in layerscope.config.ts';

/** The files whose `h(CartSummary)` Nuxt changes to the component: its loader reads no others. */
const RENDER_FILE = /\.(?:vue|jsx|tsx)$/u;

export interface AnalysisEnv extends ImportEnv {
  ownerOf: OwnerLookup;
  identifiers: Set<string>;
  components: Set<string>;
  typeImports: TypeImports;
  unresolvedSeverity: Severity;
}

/** Turns one file's scan into dependency edges and unresolved-reference findings. */
export class FileAnalysis {
  public readonly edges: Edge[] = [];
  /** Uses in a type position: `typeof x`, and `import type` when types are ignored. Not in `edges`. */
  public readonly typeEdges: Edge[] = [];
  public readonly unresolved: Finding[] = [];
  /** Renders a component chosen at runtime, so any component may be used. */
  public hasDynamicComponent = false;
  /** Why part of the file is not read; `null` when all of it is. The first reason is kept. */
  public unread: string | null = null;
  private readonly seen = new Set<string>();
  public readonly file: string;
  private readonly source: string;
  private readonly layer: Layer;
  private readonly env: AnalysisEnv;
  private readonly context: Context;
  /** The contexts whose auto-imports a free identifier is looked up in, the file's own first. */
  private readonly contexts: Context[];

  /**
   * With `anyContext`, an identifier is also looked up in the other contexts. It is for the extra
   * files that `unused` reads: a file outside the source dirs can run in any context, and a missed
   * use lists a used symbol as unused.
   */
  public constructor(
    file: string,
    source: string,
    layer: Layer,
    env: AnalysisEnv,
    anyContext = false,
  ) {
    this.file = file;
    this.source = source;
    this.layer = layer;
    this.env = env;
    this.context = contextOf(file, layer);
    this.contexts = anyContext
      ? [this.context, ...CONTEXTS.filter(context => context !== this.context)]
      : [this.context];
  }

  public run(scan: FileScan): this {
    this.unread =
      scan.error === null ? (scan.unread.at(0)?.reason ?? null) : 'Could not parse file';
    if (scan.error !== null) {
      this.addUnresolved(
        '<parse error>',
        scan.error.offset,
        `Could not parse file: ${scan.error.message}`,
      );
      return this;
    }
    for (const part of scan.unread) {
      this.addUnresolved(part.symbol, part.offset, part.message, true);
    }
    this.addIdentifiers(scan);
    this.addComponents(scan);
    this.addImports(scan);
    return this;
  }

  private addAutoImports(
    name: string,
    offset: number,
    targets: SymbolTarget[],
    type = false,
  ): void {
    for (const target of targets) {
      this.addEdge(
        'auto-import',
        name,
        offset,
        { to: target.file, external: target.module },
        undefined,
        type,
      );
    }
  }

  private addIdentifiers(scan: FileScan): void {
    // Nuxt changes `h(CartSummary)` by its text, so a local or imported `CartSummary` is the
    // component too. Such a free name is then not an auto-import or a warning. The loader of Nuxt
    // is not in the Nitro build, so a server file keeps its names.
    const components = new Set<number>();
    const isRendered = RENDER_FILE.test(this.file) && this.context !== 'server';
    for (const ref of isRendered ? scan.renderArgs : []) {
      if (this.addComponentEdges(ref)) {
        components.add(ref.offset);
      }
    }
    for (const ref of scan.free) {
      if (components.has(ref.offset)) {
        continue;
      }
      const targets = lookupAutoImports(this.env.table, this.contexts, ref.name);
      if (targets.length > 0) {
        this.addAutoImports(ref.name, ref.offset, targets);
      } else if (!this.env.identifiers.has(ref.name)) {
        this.addUnresolved(
          ref.name,
          ref.offset,
          `"${ref.name}" is not a local binding, a known global or an auto-import in the ${this.context} context; ${GLOBALS_HINT}`,
        );
      }
    }
    // A `typeof x` in a type is a use for `unused` only: no finding, no edge for the rules.
    for (const ref of scan.typeFree) {
      this.addAutoImports(
        ref.name,
        ref.offset,
        lookupAutoImports(this.env.table, this.contexts, ref.name),
        true,
      );
    }
    // Template identifiers missing from the table are props, data or global properties.
    for (const ref of scan.templateIdents) {
      this.addAutoImports(
        ref.name,
        ref.offset,
        lookupAutoImports(this.env.table, this.contexts, ref.name),
      );
    }
  }

  private addComponents(scan: FileScan): void {
    for (const ref of scan.components) {
      if (!this.addComponentEdges(ref) && !this.env.components.has(ref.name)) {
        this.addUnresolved(
          ref.name,
          ref.offset,
          `Component <${ref.name}> is not in components.d.ts; ${GLOBALS_HINT}`,
        );
      }
    }
    for (const ref of scan.islands) {
      this.addComponentEdges(ref);
    }
    this.hasDynamicComponent =
      scan.dynamicComponents.length > 0 || scan.quietDynamicComponents.length > 0;
    for (const offset of scan.dynamicComponents) {
      this.addUnresolved(
        '<component :is>',
        offset,
        'Dynamic component bound to a runtime value cannot be resolved statically',
      );
    }
  }

  /** An edge to each file of a component name; `false` when the name is not a component. */
  private addComponentEdges({ name, offset }: Named): boolean {
    const targets = this.env.table.components.get(name) ?? [];
    // Each file of the name is a dependency: Nuxt can use one in the browser and one on the server.
    for (const { file, module } of targets) {
      this.addEdge('component', name, offset, { to: file, external: module });
    }
    return targets.length > 0;
  }

  private addImports(scan: FileScan): void {
    const ignoreTypes = this.env.typeImports === 'ignore';
    for (const ref of scan.imports) {
      // An unresolved path is reported even when the import is type-only.
      for (const outcome of outcomesOf(ref, this.file, this.contexts, this.env)) {
        if (!outcome.resolved) {
          this.addUnresolved(ref.specifier, ref.offset, outcome.message);
        } else if (ignoreTypes) {
          this.addIgnoringTypes(ref, outcome);
        } else {
          this.addEdge('import', outcome.symbol, ref.offset, outcome.target, outcome.names);
        }
      }
    }
  }

  /**
   * With `typeImports: 'ignore'`, the type-only part of an import makes no edge for the rules. It
   * is still a use for `unused`, so it goes to `typeEdges`.
   */
  private addIgnoringTypes(
    ref: ImportRef,
    outcome: Extract<ImportOutcome, { resolved: true }>,
  ): void {
    const { symbol, target } = outcome;
    if (isIgnored(ref, symbol)) {
      this.addEdge('import', symbol, ref.offset, target, outcome.names, true);
      return;
    }
    const names = outcome.names?.filter(name => !ref.typeNames.includes(name));
    this.addEdge('import', symbol, ref.offset, target, names);
  }

  private reference(kind: ReferenceKind, symbol: string, offset: number): Reference {
    return { file: this.file, ...lineColumn(this.source, offset), kind, symbol };
  }

  /** Only the first use of a symbol per file is recorded. */
  private firstSeen(key: string): boolean {
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.add(key);
    return true;
  }

  private addEdge(
    kind: ReferenceKind,
    symbol: string,
    offset: number,
    target: ImportTarget,
    names?: string[],
    type = false,
  ): void {
    const edges = type ? this.typeEdges : this.edges;
    // Ownership first: a layer installed from npm owns its files under node_modules.
    const toLayer = target.to === null ? null : this.env.ownerOf(target.to);
    const isPackage = toLayer === null && target.external !== null;
    const to = isPackage ? null : target.to;
    const external = toLayer === null ? (target.external ?? 'unknown') : null;
    // A name can be two symbols (in two contexts); each target has its own edge.
    if (!this.firstSeen(`${type ? 'type\0' : ''}${kind}\0${symbol}\0${to ?? external}`)) {
      // A second import of the same file adds its names to the edge that stands for both.
      const known = edges.find(
        edge =>
          edge.kind === kind &&
          edge.symbol === symbol &&
          edge.to === to &&
          edge.external === external,
      );
      if (known?.names !== undefined && names !== undefined) {
        known.names = [...new Set([...known.names, ...names])];
      }
      if (known !== undefined && kind === 'import') {
        const { line, column } = this.reference(kind, symbol, offset);
        known.sites = [...(known.sites ?? []), { line, column }];
      }
      return;
    }
    edges.push({
      ...this.reference(kind, symbol, offset),
      fromLayer: this.layer.name,
      to,
      toLayer: toLayer?.name ?? null,
      external,
      ...(names === undefined ? {} : { names }),
    });
  }

  private addUnresolved(symbol: string, offset: number, message: string, each = false): void {
    const severity = this.env.unresolvedSeverity;
    // Each unread part is its own finding, so the key has the offset.
    const key = each ? `unresolved\0${symbol}\0${offset}` : `unresolved\0${symbol}`;
    if (severity === 'off' || !this.firstSeen(key)) {
      return;
    }
    this.unresolved.push({
      rule: 'unresolved-reference',
      severity,
      file: this.file,
      ...lineColumn(this.source, offset),
      symbol,
      fromLayer: this.layer.name,
      toLayer: null,
      target: null,
      message,
    });
  }
}
