import type { SymbolTable } from './nuxt/symbols.ts';

export type Severity = 'off' | 'warn' | 'error';

export type RuleName = 'layer-boundary' | 'unresolved-reference' | 'shadowed-component';

/** The Nuxt auto-import context a source file runs in. */
export type Context = 'app' | 'server' | 'shared';

export interface Layer {
  name: string;
  root: string;
  srcDir: string;
  serverDir: string;
  sharedDir: string;
  /** Whether the layer uses Nuxt's default `<srcDir>/components` dir. */
  defaultComponents: boolean;
}

export type ReferenceKind = 'auto-import' | 'component' | 'import';

export interface Reference {
  file: string;
  line: number;
  column: number;
  kind: ReferenceKind;
  /** Identifier, component name or import specifier. */
  symbol: string;
}

export interface Edge extends Reference {
  fromLayer: string;
  /** `null` when the target is outside every layer. */
  to: string | null;
  toLayer: string | null;
  /** Package or virtual module name for targets outside every layer. */
  external: string | null;
}

export type SuggestionAction = 'move' | 'allow' | 'leave';

/** What a suggestion changes, in counts that `check` can confirm. */
export interface SuggestionImpact {
  /** Boundary findings cleared. */
  fixes: number;
  /** move: files that use the moved file. */
  files?: number;
  /** move: explicit imports that need a new specifier. */
  imports?: number;
  /** allow: edges added to the `allow` map. */
  edges?: number;
}

export interface Suggestion {
  action: SuggestionAction;
  message: string;
  /** move: the layer to move the file to, and where it lands. */
  layer?: string;
  file?: string;
  impact: SuggestionImpact;
}

export interface Finding {
  rule: RuleName;
  severity: Exclude<Severity, 'off'>;
  file: string;
  line: number;
  column: number;
  symbol: string;
  fromLayer: string;
  toLayer: string | null;
  /** File the symbol resolves to, when known. */
  target: string | null;
  /** Layers `fromLayer` may depend on, for `layer-boundary` findings. */
  allowed?: string[];
  message: string;
  /** Set on `layer-boundary` findings. */
  suggestion?: Suggestion;
}

export interface LayerRule {
  /** Layers this layer may depend on. Layers missing from config are unrestricted. */
  allow?: string[];
  /** Layer root relative to the project root; names a layer or declares it without @nuxt/kit. */
  path?: string;
  /** The `extends` source of a remote layer (`github:org/repo`); names the layer c12 cloned from it. */
  source?: string;
}

export interface LayerscopeConfig {
  layers?: Record<string, LayerRule>;
  rules?: Partial<Record<RuleName | 'unused-symbol', Severity>>;
  /** Globs relative to each scanned dir. */
  ignore?: string[];
  /** Identifiers and component names never reported as unresolved. */
  globals?: string[];
  /** Relative to the project root. Defaults to `.nuxt`. */
  buildDir?: string;
}

/**
 * `registry`: `.nuxt/layerscope/registry.json`, written by the `nuxt-layerscope` Nuxt
 * module. `types`: the generated `.d.ts` files, used when the module is not installed.
 */
export type ResolutionSource = 'registry' | 'types';

/** `auto` reads the registry when the Nuxt module wrote one, and the `.d.ts` files otherwise. */
export type SourceOption = ResolutionSource | 'auto';

/** A finding counts by rule, file, symbol and target layer, never by line. */
export interface BaselineEntry {
  rule: RuleName;
  /** Relative to the project root. */
  file: string;
  symbol: string;
  toLayer: string | null;
  /** How often the key occurs; defaults to 1. */
  count?: number;
}

export interface BaselineResult {
  file: string;
  /** Findings present in the baseline, left out of `findings`. */
  suppressed: Finding[];
  /** Entries that no longer occur and can be removed with `--update-baseline`. */
  removable: BaselineEntry[];
}

export interface AnalyzeResult {
  rootDir: string;
  /** The config that applied: `layerscope.config.*` or the `layerscope` key of `nuxt.config`. */
  config: LayerscopeConfig;
  source: ResolutionSource;
  /** File the symbols were read from. */
  sourceFile: string;
  layers: Layer[];
  files: string[];
  edges: Edge[];
  findings: Finding[];
  /** Things the user should know about the run, such as rules that could not run. */
  notes: string[];
  /** Every auto-import and component Nuxt registered, by context. */
  symbols: SymbolTable;
  /** Files rendering a component chosen at runtime (`<component :is>`, `resolveComponent(x)`). */
  dynamicComponentFiles: string[];
  /** Set when a baseline was applied; `findings` then holds only the new ones. */
  baseline?: BaselineResult;
}
