import type { Registry } from '#src/registry/schema.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import type { AnalyzeResult, Edge, Finding, Layer } from '#src/types.ts';

export function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    file: '/app/pages/index.vue',
    line: 3,
    column: 5,
    kind: 'auto-import',
    symbol: 'useCart',
    fromLayer: 'web',
    to: '/app/layers/shop/composables/useCart.ts',
    toLayer: 'shop',
    external: null,
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: 'layer-boundary',
    severity: 'error',
    file: '/app/pages/index.vue',
    line: 3,
    column: 5,
    symbol: 'useCart',
    fromLayer: 'web',
    toLayer: 'shop',
    target: '/app/layers/shop/composables/useCart.ts',
    message: 'Auto-import "useCart" crosses from layer "web" into "shop"',
    ...overrides,
  };
}

export function makeLayer(name: string, root: string): Layer {
  return {
    name,
    root,
    srcDir: root,
    serverDir: `${root}/server`,
    sharedDir: `${root}/shared`,
    defaultComponents: true,
  };
}

export function makeResult(overrides: Partial<AnalyzeResult> = {}): AnalyzeResult {
  return {
    rootDir: '/app',
    config: {},
    source: 'registry',
    sourceFile: '/app/.nuxt/layerscope/registry.json',
    layers: [makeLayer('web', '/app'), makeLayer('shop', '/app/layers/shop')],
    files: ['/app/pages/index.vue', '/app/pages/cart.vue'],
    edges: [],
    findings: [],
    notes: [],
    symbols: {
      imports: { app: new Map(), server: new Map(), shared: new Map() },
      components: new Map(),
    },
    dynamicComponentFiles: [],
    ...overrides,
  };
}

/** A registry holding only shadowed components, given as `[name, file, shadowedBy]`. */
export function makeRegistry(
  shadowed: [name: string, file: string, shadowedBy: string][] = [],
): Registry {
  return {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: [],
    components: [],
    shadowedComponents: shadowed.map(([name, file, shadowedBy]) => ({
      name,
      file,
      shadowedBy,
      mode: 'all',
      island: false,
      priority: 0,
    })),
    componentDirs: [],
    imports: { app: [], server: [], shared: [] },
  };
}
