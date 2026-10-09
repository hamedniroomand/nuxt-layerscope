import { readFileSync } from 'node:fs';

import type { OwnerLookup } from '#src/nuxt/owner.ts';
import { scanFile } from '#src/scan/index.ts';
import type { FileScan } from '#src/scan/types.ts';
import type {
  Context,
  Edge,
  Finding,
  Layer,
  Reference,
  ReferenceKind,
  Severity,
} from '#src/types.ts';
import { lineColumn } from '#src/utils/position.ts';

import { contextOf } from './files.ts';
import type { ImportEnv, ImportTarget } from './import-refs.ts';
import { resolveImportRef } from './import-refs.ts';

/** Runtime registrations (plugins, `app.component`, `vueApp.use`) are invisible statically. */
const GLOBALS_HINT = 'if it is registered at runtime, add it to "globals" in layerscope.config.ts';

export interface AnalysisEnv extends ImportEnv {
  ownerOf: OwnerLookup;
  identifiers: Set<string>;
  components: Set<string>;
  unresolvedSeverity: Severity;
}

/** Turns one file's scan into dependency edges and unresolved-reference findings. */
export class FileAnalysis {
  public readonly edges: Edge[] = [];
  public readonly unresolved: Finding[] = [];
  /** Renders a component chosen at runtime, so any component may be used. */
  public hasDynamicComponent = false;
  private readonly seen = new Set<string>();
  public readonly file: string;
  private readonly source: string;
  private readonly layer: Layer;
  private readonly env: AnalysisEnv;
  private readonly context: Context;

  public constructor(file: string, source: string, layer: Layer, env: AnalysisEnv) {
    this.file = file;
    this.source = source;
    this.layer = layer;
    this.env = env;
    this.context = contextOf(file, layer);
  }

  public run(scan: FileScan): this {
    if (scan.error !== null) {
      this.addUnresolved(
        '<parse error>',
        scan.error.offset,
        `Could not parse file: ${scan.error.message}`,
      );
      return this;
    }
    this.addIdentifiers(scan);
    this.addComponents(scan);
    this.addImports(scan);
    return this;
  }

  private addIdentifiers(scan: FileScan): void {
    const imports = this.env.table.imports[this.context];
    for (const ref of scan.free) {
      const target = imports.get(ref.name);
      if (target !== undefined) {
        this.addEdge('auto-import', ref.name, ref.offset, {
          to: target.file,
          external: target.module,
        });
      } else if (!this.env.identifiers.has(ref.name)) {
        this.addUnresolved(
          ref.name,
          ref.offset,
          `"${ref.name}" is not a local binding, a known global or an auto-import in the ${this.context} context; ${GLOBALS_HINT}`,
        );
      }
    }
    // Template identifiers missing from the table are props, data or global properties.
    for (const ref of scan.templateIdents) {
      const target = imports.get(ref.name);
      if (target !== undefined) {
        this.addEdge('auto-import', ref.name, ref.offset, {
          to: target.file,
          external: target.module,
        });
      }
    }
  }

  private addComponents(scan: FileScan): void {
    for (const ref of scan.components) {
      const target = this.env.table.components.get(ref.name);
      if (target !== undefined) {
        this.addEdge('component', ref.name, ref.offset, {
          to: target.file,
          external: target.module,
        });
      } else if (!this.env.components.has(ref.name)) {
        this.addUnresolved(
          ref.name,
          ref.offset,
          `Component <${ref.name}> is not in components.d.ts; ${GLOBALS_HINT}`,
        );
      }
    }
    this.hasDynamicComponent = scan.dynamicComponents.length > 0;
    for (const offset of scan.dynamicComponents) {
      this.addUnresolved(
        '<component :is>',
        offset,
        'Dynamic component bound to a runtime value cannot be resolved statically',
      );
    }
  }

  private addImports(scan: FileScan): void {
    for (const ref of scan.imports) {
      for (const outcome of resolveImportRef(ref, this.file, this.context, this.env)) {
        if (outcome.resolved) {
          this.addEdge('import', outcome.symbol, ref.offset, outcome.target, outcome.names);
        } else {
          this.addUnresolved(ref.specifier, ref.offset, outcome.message);
        }
      }
    }
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
  ): void {
    if (!this.firstSeen(`${kind}\0${symbol}`)) {
      // A second import of the same file adds its names to the edge that stands for both.
      const known = this.edges.find(edge => edge.kind === kind && edge.symbol === symbol);
      if (known?.names !== undefined && names !== undefined) {
        known.names = [...new Set([...known.names, ...names])];
      }
      return;
    }
    // Ownership first: a layer installed from npm owns its files under node_modules.
    const toLayer = target.to === null ? null : this.env.ownerOf(target.to);
    const isPackage = toLayer === null && target.external !== null;
    this.edges.push({
      ...this.reference(kind, symbol, offset),
      fromLayer: this.layer.name,
      to: isPackage ? null : target.to,
      toLayer: toLayer?.name ?? null,
      external: toLayer === null ? (target.external ?? 'unknown') : null,
      ...(names === undefined ? {} : { names }),
    });
  }

  private addUnresolved(symbol: string, offset: number, message: string): void {
    const severity = this.env.unresolvedSeverity;
    if (severity === 'off' || !this.firstSeen(`unresolved\0${symbol}`)) {
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

/** Reads, scans and analyzes one source file. */
export function analyzeFile(file: string, layer: Layer, env: AnalysisEnv): FileAnalysis {
  const source = readFileSync(file, 'utf8');
  return new FileAnalysis(file, source, layer, env).run(scanFile(source, file));
}
