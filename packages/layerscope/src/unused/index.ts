import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { SymbolMap, SymbolTarget } from '#src/nuxt/symbols.ts';
import type { AnalyzeResult, Context, Edge } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

export type UnusedKind = 'component' | 'auto-import';

export interface UnusedSymbol {
  name: string;
  kind: UnusedKind;
  /** Auto-import context; `null` for components. */
  context: Context | null;
  file: string;
  layer: string;
  /**
   * The project renders components chosen at runtime, so a component may still be used
   * without any static reference.
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
function componentsByFile(components: SymbolMap): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const [name, target] of components) {
    if (target.file !== null) {
      byFile.set(target.file, [...(byFile.get(target.file) ?? []), name]);
    }
  }
  return byFile;
}

function shortestName(names: string[]): string {
  return names.toSorted((a, b) => a.length - b.length || compareStrings(a, b))[0];
}

/**
 * Components and auto-imports registered by the project's own layers that nothing references.
 * Layers installed as packages are not checked, so their symbols are never reported.
 */
export function findUnused(result: AnalyzeResult): UnusedSymbol[] {
  const ownerOf = createOwnerLookup(result.layers);
  const checked = (target: SymbolTarget): string | null => {
    const layer = target.file === null ? null : ownerOf(target.file);
    return layer === null || layer.root.includes('/node_modules/') ? null : layer.name;
  };
  const uses = collectUses(result.edges);
  const possiblyUsed = result.dynamicComponentFiles.length > 0;
  const unused: UnusedSymbol[] = [];
  for (const [file, names] of componentsByFile(result.symbols.components)) {
    const layer = checked({ file, module: null });
    if (layer !== null && !isUsed(uses, file, names)) {
      const name = shortestName(names);
      unused.push({ name, kind: 'component', context: null, file, layer, possiblyUsed });
    }
  }
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
        unused.push({ name, kind: 'auto-import', context, file, layer, possiblyUsed: false });
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
