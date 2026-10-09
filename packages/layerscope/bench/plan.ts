/**
 * The plan of the synthetic benchmark project: which files it has and what is in them. It is
 * built in memory, from a seed, so the same options always give the same project.
 */

export interface PlannedFile {
  path: string;
  content: string;
}

export interface Plan {
  files: PlannedFile[];
  layers: string[];
  /** Findings that `layerscope check` must report: one deliberate violation per file. */
  expectedFindings: number;
  /** Files that hold source code: components, composables, utils and server files. */
  sourceFiles: number;
}

export interface PlanOptions {
  /** Source files in all layers together. */
  files?: number;
  seed?: number;
}

/** Layer name and the layers it may use (`shared` is allowed for everyone). */
const LAYERS: [string, string[]][] = [
  ['shared', []],
  ['auth', ['shared']],
  ['catalog', ['shared']],
  ['cart', ['shared', 'catalog']],
  ['checkout', ['shared', 'cart', 'auth']],
  ['orders', ['shared', 'checkout', 'auth']],
  ['search', ['shared', 'catalog']],
  ['profile', ['shared', 'auth']],
  ['admin', ['shared', 'auth', 'catalog', 'orders']],
  ['reports', ['shared', 'orders', 'catalog']],
];

/** Share of the source files that carry one violation. */
export const VIOLATION_RATE = 0.02;

type Kind = 'component' | 'composable' | 'util' | 'serverUtil' | 'api';

/** Of each 100 files: 40 components, 25 composables, 15 utils, 10 server utils, 10 API routes. */
const MIX: [Kind, number][] = [
  ['component', 40],
  ['composable', 25],
  ['util', 15],
  ['serverUtil', 10],
  ['api', 10],
];

/* eslint-disable no-bitwise -- a bit-mixing generator is the point of this function */
/** A small seeded random number generator (mulberry32), so a run does not depend on the machine. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/* eslint-enable no-bitwise */

function pascal(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** How many files of each kind a layer gets, from its share of the total. */
function countsFor(total: number): Record<Kind, number> {
  const counts = {} as Record<Kind, number>;
  for (const [kind, share] of MIX) {
    counts[kind] = Math.max(1, Math.round((total * share) / 100));
  }
  return counts;
}

const NAMES: Record<Kind, (layer: string, index: number) => string> = {
  component: (layer, index) => `${pascal(layer)}Card${index}`,
  composable: (layer, index) => `use${pascal(layer)}${index}`,
  util: (layer, index) => `${layer}Util${index}`,
  serverUtil: (layer, index) => `${layer}Store${index}`,
  api: (layer, index) => `${layer}Api${index}`,
};

/** The symbol that a file of this kind exports, and that other files use. */
export function symbolName(layer: string, kind: Kind, index: number): string {
  return NAMES[kind](layer, index);
}

const PATHS: Record<Kind, (layer: string, index: number) => string> = {
  component: (layer, index) =>
    `layers/${layer}/app/components/${NAMES.component(layer, index)}.vue`,
  composable: (layer, index) =>
    `layers/${layer}/app/composables/${NAMES.composable(layer, index)}.ts`,
  util: (layer, index) => `layers/${layer}/app/utils/${NAMES.util(layer, index)}.ts`,
  serverUtil: (layer, index) => `layers/${layer}/server/utils/${NAMES.serverUtil(layer, index)}.ts`,
  api: (layer, index) => `layers/${layer}/server/api/${layer}-${index}.get.ts`,
};

function pathOf(layer: string, kind: Kind, index: number): string {
  return PATHS[kind](layer, index);
}

type Pools = Map<string, Record<'app' | 'server', { kind: Kind; name: string }[]>>;

function buildPools(perLayer: Record<Kind, number>): Pools {
  const pools: Pools = new Map();
  for (const [layer] of LAYERS) {
    const app: { kind: Kind; name: string }[] = [];
    const server: { kind: Kind; name: string }[] = [];
    for (const kind of ['component', 'composable', 'util'] as const) {
      for (let index = 0; index < perLayer[kind]; index += 1) {
        app.push({ kind, name: symbolName(layer, kind, index) });
      }
    }
    for (let index = 0; index < perLayer.serverUtil; index += 1) {
      server.push({ kind: 'serverUtil', name: symbolName(layer, 'serverUtil', index) });
    }
    pools.set(layer, { app, server });
  }
  return pools;
}

interface Reference {
  kind: Kind;
  name: string;
}

/** Only a component file can use a component: its template is the only place for a tag. */
function usable(
  pools: Pools,
  layer: string,
  side: 'app' | 'server',
  withComponents: boolean,
): Reference[] {
  const pool = pools.get(layer)?.[side] ?? [];
  return withComponents ? pool : pool.filter(item => item.kind !== 'component');
}

function pick(random: () => number, items: Reference[]): Reference | undefined {
  return items[Math.floor(random() * items.length)];
}

/** Two to six symbols from the layer itself and from the layers it may use. */
function referencesFor(
  random: () => number,
  layer: string,
  side: 'app' | 'server',
  pools: Pools,
  self: string,
  withComponents: boolean,
): Reference[] {
  const allowed = [layer, ...(LAYERS.find(([name]) => name === layer)?.[1] ?? [])];
  const found: Reference[] = [];
  const wanted = 2 + Math.floor(random() * 5);
  for (let attempt = 0; attempt < wanted * 3 && found.length < wanted; attempt += 1) {
    // Half of the uses stay in the layer; the rest go to a layer it may use.
    const from = random() < 0.5 ? layer : (allowed[Math.floor(random() * allowed.length)] ?? layer);
    const symbol = pick(random, usable(pools, from, side, withComponents));
    if (symbol !== undefined && symbol.name !== self && !found.some(f => f.name === symbol.name)) {
      found.push(symbol);
    }
  }
  return found;
}

/** A symbol of a layer that `layer` may not use, for the one deliberate violation of a file. */
function violationFor(
  random: () => number,
  layer: string,
  side: 'app' | 'server',
  pools: Pools,
  withComponents: boolean,
): Reference | undefined {
  const allowed = new Set([layer, ...(LAYERS.find(([name]) => name === layer)?.[1] ?? [])]);
  const others = LAYERS.map(([name]) => name).filter(name => !allowed.has(name));
  if (others.length === 0) {
    return undefined;
  }
  const target = others[Math.floor(random() * others.length)] ?? '';
  return pick(random, usable(pools, target, side, withComponents));
}

function render(kind: Kind, name: string, uses: Reference[]): string {
  const components = uses.filter(use => use.kind === 'component');
  const calls = uses.filter(use => use.kind !== 'component');
  const callLines = calls.map((use, index) => `const v${index} = ${use.name}(${index});`);
  if (kind === 'component') {
    return [
      '<script setup lang="ts">',
      ...callLines,
      `const total = ${calls.map((_, index) => `v${index}`).join(' + ') || '0'};`,
      '</script>',
      '',
      '<template>',
      '  <div>',
      ...components.map(use => `    <${use.name} />`),
      '    {{ total }}',
      '  </div>',
      '</template>',
      '',
    ].join('\n');
  }
  if (kind === 'api') {
    return `export default defineEventHandler(() => {\n  ${callLines.join('\n  ')}\n  return [${calls.map((_, index) => `v${index}`).join(', ')}];\n});\n`;
  }
  return `export function ${name}(input: number): number {\n  ${callLines.join('\n  ')}\n  return input + ${calls.map((_, index) => `v${index}`).join(' + ') || '0'};\n}\n`;
}

const PROJECT_FILES: PlannedFile[] = [
  {
    path: 'package.json',
    content: `${JSON.stringify({ name: 'layerscope-bench', private: true, type: 'module' }, null, 2)}\n`,
  },
  {
    path: 'nuxt.config.ts',
    content: `export default defineNuxtConfig({
  srcDir: 'app',
  modules: ['../../src/index.ts'],
  compatibilityDate: '2025-07-15',
});
`,
  },
  {
    path: 'app/app.vue',
    content: '<template>\n  <div>layerscope benchmark</div>\n</template>\n',
  },
];

function configFile(): PlannedFile {
  const layers = LAYERS.map(
    ([name, allow]) => `    ${name}: { allow: [${allow.map(item => `'${item}'`).join(', ')}] },`,
  );
  return {
    path: 'layerscope.config.ts',
    content: `import { defineConfig } from 'nuxt-layerscope';\n\nexport default defineConfig({\n  layers: {\n${layers.join('\n')}\n  },\n});\n`,
  };
}

/** One source file, and how many violations it carries (none or one). */
function planSource(
  random: () => number,
  layer: string,
  kind: Kind,
  index: number,
  pools: Pools,
): { file: PlannedFile; violations: number } {
  const side = kind === 'serverUtil' || kind === 'api' ? 'server' : 'app';
  const name = symbolName(layer, kind, index);
  const withComponents = kind === 'component';
  const uses = referencesFor(random, layer, side, pools, name, withComponents);
  const violation =
    random() < VIOLATION_RATE
      ? violationFor(random, layer, side, pools, withComponents)
      : undefined;
  if (violation !== undefined) {
    uses.push(violation);
  }
  return {
    file: { path: pathOf(layer, kind, index), content: render(kind, name, uses) },
    violations: violation === undefined ? 0 : 1,
  };
}

/** The whole project: `files` source files in ten layers, and the findings they must produce. */
export function planProject(options: PlanOptions = {}): Plan {
  const total = options.files ?? 3000;
  const random = createRandom(options.seed ?? 1);
  const perLayer = countsFor(Math.max(1, Math.round(total / LAYERS.length)));
  const pools = buildPools(perLayer);
  const files: PlannedFile[] = [...PROJECT_FILES, configFile()];
  for (const [layer] of LAYERS) {
    files.push({ path: `layers/${layer}/nuxt.config.ts`, content: 'export default {};\n' });
  }
  let expectedFindings = 0;
  for (const [layer] of LAYERS) {
    for (const [kind] of MIX) {
      for (let index = 0; index < perLayer[kind]; index += 1) {
        const made = planSource(random, layer, kind, index, pools);
        files.push(made.file);
        expectedFindings += made.violations;
      }
    }
  }
  const sourceFiles =
    LAYERS.length * Object.values(perLayer).reduce((sum, count) => sum + count, 0);
  return { files, layers: LAYERS.map(([name]) => name), expectedFindings, sourceFiles };
}
