import { writeFileSync } from 'node:fs';

import { join, relative } from 'pathe';

import { analyze } from '#src/analyze/index.ts';

import { empty, write } from './fix-project.ts';

/** Random projects for the property tests of `fix`. The seeds are fixed, so a failure can run again. */
const LAYERS = ['a', 'b', 'c', 'd', 's', 't'];
export const SEEDS = [7, 1, 23, 51];
export const PROJECTS = 8;
const MODES = ['none', 'all', 'some', 'stale', 'count'] as const;

export type Random = () => number;

export function randomFrom(seed: number): Random {
  let state = seed;
  return () => {
    // Park and Miller: the products stay below 2 ** 53, so the numbers are exact.
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

export function pick<T>(random: Random, items: T[]): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

export interface Source {
  name: string;
  layer: string;
  dir: string;
}

export function pathOf(file: Source): string {
  return `layers/${file.layer}/app/${file.dir}/${file.name}.ts`;
}

function specifier(from: Source, to: Source): string {
  if (from.layer !== to.layer) {
    return `../../../${to.layer}/app/${to.dir}/${to.name}`;
  }
  return from.dir === to.dir ? `./${to.name}` : `../${to.dir}/${to.name}`;
}

/** A page in a `.vue` file that imports the first two files, in the first layer. No random draw. */
function writePage(root: string, files: Source[]): void {
  const page: Source = { name: 'p', layer: LAYERS[0], dir: 'pages' };
  const lines = files
    .slice(0, 2)
    .map(other => `import { ${other.name} as p_${other.name} } from "${specifier(page, other)}";`);
  write(
    root,
    `layers/${page.layer}/app/pages/p.vue`,
    `<script setup lang="ts">\n${lines.join('\n')}\nconsole.log(p_f0, p_f1);\n</script>\n`,
  );
}

/** Files in random layers, which import each other at random. */
function writeFiles(root: string, random: Random): Source[] {
  const count = 8 + Math.floor(random() * 8);
  const files = Array.from({ length: count }, (_, index) => ({
    name: `f${index}`,
    layer: pick(random, LAYERS),
    dir: pick(random, ['utils', 'composables']),
  }));
  for (const file of files) {
    // Each fourth file writes double quotes, so that both kinds of quote are in the projects.
    const quote = Number(file.name.slice(1)) % 4 === 3 ? '"' : "'";
    const imports = files.filter(other => other !== file && random() < 0.18);
    const lines = imports.map(
      other =>
        `import { ${other.name} as i_${other.name} } from ${quote}${specifier(file, other)}${quote};`,
    );
    // Each third import comes twice: a type import and a value import of the same file.
    const again = imports.filter((_, index) => index % 3 === 0);
    lines.push(
      ...again.map(
        other =>
          `import type { ${other.name} as j_${other.name} } from ${quote}${specifier(file, other)}${quote};`,
      ),
    );
    const names = imports.map(other => `i_${other.name}`);
    write(
      root,
      pathOf(file),
      `${lines.join('\n')}\nexport const ${file.name} = [${names.join(',')}];\n`,
    );
  }
  writePage(root, files);
  return files;
}

export function writeProject(random: Random): { root: string; files: Source[] } {
  const layers = LAYERS.map(layer => {
    const allow = LAYERS.filter(other => other !== layer && random() < 0.45);
    return `${layer}: { path: 'layers/${layer}', allow: ${JSON.stringify(allow)} }`;
  });
  const root = empty(`${layers.join(',')} }, rules: { 'layer-cycle': 'error'`);
  return { root, files: writeFiles(root, random) };
}

interface Entry {
  rule: string;
  file: string;
  symbol: string;
  toLayer: string | null;
  count?: number;
}

/** A baseline with some of the cycles, all of them, entries for files that moved, or counts. */
function baselineEntries(random: Random, cycles: Entry[], files: Source[]): Entry[] {
  const mode = pick(random, [...MODES]);
  const any = (): string => pathOf(pick(random, files));
  if (mode === 'all') {
    return cycles;
  }
  if (mode === 'some') {
    return cycles.filter(() => random() < 0.5);
  }
  if (mode === 'count') {
    return cycles.map(entry => ({ ...entry, count: 2 }));
  }
  if (mode === 'stale') {
    const kept = cycles.filter(() => random() < 0.5);
    return [...kept, ...cycles.map(entry => ({ ...entry, file: any() }))];
  }
  return [];
}

export async function baselineFile(
  root: string,
  random: Random,
  files: Source[],
): Promise<string | undefined> {
  const found = await analyze({ rootDir: root });
  const cycles = found.findings
    .filter(finding => finding.rule === 'layer-cycle')
    .map(({ rule, file, symbol, toLayer }) => ({
      rule,
      file: relative(root, file),
      symbol,
      toLayer,
    }));
  const entries = baselineEntries(random, cycles, files);
  if (entries.length === 0) {
    return undefined;
  }
  writeFileSync(join(root, 'b.json'), JSON.stringify({ version: 1, entries }));
  return 'b.json';
}
