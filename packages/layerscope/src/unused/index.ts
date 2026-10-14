import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { isOutsideRoot, isPackageLayer } from '#src/nuxt/package-layer.ts';
import type { ComponentMap, SymbolTarget } from '#src/nuxt/symbols.ts';
import { exposureOf } from '#src/rules/layer-internal.ts';
import type { AnalyzeResult, Context, Edge, Layer } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

export type UnusedKind = 'component' | 'auto-import';

export interface UnusedSymbol {
  name: string;
  kind: UnusedKind;
  /** Auto-import context; `null` for components. */
  context: Context | null;
  file: string;
  layer: string;
  /** The layer lists the symbol in `expose`: removing it changes what other layers can use. */
  exposed: boolean;
  /** A global component: Vue can render it by a name chosen at runtime. */
  global: boolean;
  /**
   * The component may still be used without any static reference: it is global, the project
   * renders components chosen at runtime, or the project uses Nuxt Content.
   */
  possiblyUsed: boolean;
}

const CONTEXTS: Context[] = ['app', 'server', 'shared'];
const VIRTUAL_IMPORT = /^#(?:imports|components):(.+)$/u;

interface Uses {
  /** Imported explicitly: every export of the file counts as used. */
  files: Set<string>;
  /** `file\0name` of auto-imports and components referenced by name. */
  symbols: Set<string>;
}

function symbolKey(file: string, name: string): string {
  return `${file}\0${name}`;
}

function collectUses(edges: Edge[]): Uses {
  const uses: Uses = { files: new Set(), symbols: new Set() };
  for (const edge of edges) {
    if (edge.to === null) {
      continue;
    }
    const virtual = VIRTUAL_IMPORT.exec(edge.symbol);
    if (edge.kind === 'import' && virtual === null) {
      uses.files.add(edge.to);
    } else {
      uses.symbols.add(symbolKey(edge.to, virtual?.[1] ?? edge.symbol));
    }
  }
  return uses;
}

function isUsed(uses: Uses, file: string, names: string[]): boolean {
  return uses.files.has(file) || names.some(name => uses.symbols.has(symbolKey(file, name)));
}

/** Component names by file; `BaseButton` and `LazyBaseButton` are one component. */
function componentsByFile(components: ComponentMap): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const [name, targets] of components) {
    for (const { file } of targets) {
      if (file !== null) {
        byFile.set(file, [...(byFile.get(file) ?? []), name]);
      }
    }
  }
  return byFile;
}

function shortestName(names: string[]): string {
  return names.toSorted((a, b) => a.length - b.length || compareStrings(a, b))[0];
}

function isExposedSymbol(
  result: AnalyzeResult,
  layer: string,
  file: string,
  name: string,
  kind: 'component' | 'auto-import',
): boolean {
  const edge: Edge = {
    file: '',
    line: 1,
    column: 1,
    kind,
    symbol: name,
    fromLayer: '',
    to: file,
    toLayer: layer,
    external: null,
  };
  return exposureOf(edge, result.config, result.layers) === 'exposed';
}

/**
 * The name of the layer when its symbols are listed. A layer installed as a package is not
 * checked, and a layer outside the project root can be used by another app.
 */
function listedLayer(layer: Layer | null, rootDir: string): string | null {
  return layer === null || isPackageLayer(layer) || isOutsideRoot(layer, rootDir)
    ? null
    : layer.name;
}

/** The unused components, each marked when it may still be used by a name chosen at runtime. */
function unusedComponents(
  result: AnalyzeResult,
  uses: Uses,
  checked: (target: SymbolTarget) => string | null,
): UnusedSymbol[] {
  const anyPossiblyUsed = result.dynamicComponentFiles.length > 0 || result.nuxtContent;
  const globalFiles = new Set(result.globalComponentFiles);
  const unused: UnusedSymbol[] = [];
  for (const [file, names] of componentsByFile(result.symbols.components)) {
    const layer = checked({ file, module: null });
    if (layer !== null && !isUsed(uses, file, names)) {
      const name = shortestName(names);
      const exposed = isExposedSymbol(result, layer, file, name, 'component');
      const global = globalFiles.has(file);
      const possiblyUsed = global || anyPossiblyUsed;
      unused.push({
        name,
        kind: 'component',
        context: null,
        file,
        layer,
        exposed,
        global,
        possiblyUsed,
      });
    }
  }
  return unused;
}

/**
 * Components and auto-imports registered by the project's own layers that nothing references.
 * Layers installed as packages are not checked, and the symbols of a layer outside the project
 * root (for example a workspace package) are not listed, because another app can use them. So
 * their symbols are never reported.
 */
export function findUnused(result: AnalyzeResult): UnusedSymbol[] {
  const ownerOf = createOwnerLookup(result.layers);
  const checked = (target: SymbolTarget): string | null =>
    listedLayer(target.file === null ? null : ownerOf(target.file), result.rootDir);
  const uses = collectUses([...result.edges, ...result.extraEdges, ...result.typeEdges]);
  const unused = unusedComponents(result, uses, checked);
  const seen = new Set<string>();
  for (const context of CONTEXTS) {
    for (const [name, target] of result.symbols.imports[context]) {
      const layer = checked(target);
      const key = target.file === null ? '' : symbolKey(target.file, name);
      if (layer === null || target.file === null || seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (!isUsed(uses, target.file, [name])) {
        const { file } = target;
        const exposed = isExposedSymbol(result, layer, file, name, 'auto-import');
        unused.push({
          name,
          kind: 'auto-import',
          context,
          file,
          layer,
          exposed,
          global: false,
          possiblyUsed: false,
        });
      }
    }
  }
  const order = new Map(result.layers.map((layer, index) => [layer.name, index]));
  return unused.toSorted(
    (a, b) =>
      (order.get(a.layer) ?? 0) - (order.get(b.layer) ?? 0) ||
      compareStrings(a.file, b.file) ||
      compareStrings(a.name, b.name),
  );
}
