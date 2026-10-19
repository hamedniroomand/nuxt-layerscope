import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import type { Import } from 'unimport';
import { createUnimport } from 'unimport';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import { shadowedImports } from '#src/module/imports.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { shadowedFileFindings } from '#src/rules/shadowed.ts';
import { makeLayer, makeRegistry } from '#test/factories.ts';

/** A small seeded random source, so that a failure gives the same input again. */
function random(seed: number): (max: number) => number {
  let state = seed;
  return max => {
    state = (state * 48_271) % 2_147_483_647;
    return state % max;
  };
}

const LAYERS = 4;
const NAMES = ['useCart', 'useUser', 'formatPrice'];
// `shared/` is outside the source dir (`app/`) of a layer, so Nuxt gives it no priority.
const DIRS = ['app/composables', 'app/utils', 'shared/utils'];
const top = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-imports-oracle-')));
afterAll(() => {
  rmSync(top, { recursive: true, force: true });
});

/** Random entries in the order and with the priority that Nuxt gives them (its `imports` module). */
function entries(next: (max: number) => number, root: string): Import[] {
  // One entry for each file and name, as the scan of Nuxt gives them.
  const found = new Map<string, Import>();
  for (const _ of Array.from({ length: next(7) + 2 })) {
    const layer = next(LAYERS);
    const dir = next(DIRS.length);
    const name = NAMES[next(NAMES.length)];
    const from = join(root, `L${layer}`, DIRS[dir], `${name}${next(2)}.ts`);
    const extra = [
      {},
      {},
      {},
      { type: true },
      { declarationType: 'enum' as const },
      { disabled: true },
    ][next(6)];
    // Nuxt: `i.priority ||= -index` of the layer whose source dir holds the file.
    const priority = from.startsWith(join(root, `L${layer}`, 'app/')) ? -layer : undefined;
    found.set(from, { name, from, priority, ...extra });
    mkdirSync(join(from, '..'), { recursive: true });
    writeFileSync(from, '');
  }
  return [...found.values()].toSorted((a, b) => (a.from < b.from ? -1 : 1));
}

/** The entries that a real unimport uses, with the presets of Nuxt as the static entries. */
async function used(presets: Import[], scanned: Import[]): Promise<Import[]> {
  const context = createUnimport({ imports: presets, warn: (): void => undefined });
  await context.modifyDynamicImports(imports => {
    imports.push(...scanned);
  });
  return context.getImports();
}

const key = (entry: Import): string => `${entry.as ?? entry.name}\0${entry.from}`;
const isValue = (entry: Import): boolean =>
  entry.type !== true && entry.disabled !== true && entry.declarationType === undefined;
const layerOf = (from: string): string => /\/(L\d)\//u.exec(from)?.[1] ?? '';

/** Checks one random project: the findings of the rule against what unimport keeps. */
async function check(root: string, presets: Import[], scanned: Import[]): Promise<void> {
  const context = createUnimport({ imports: presets, warn: (): void => undefined });
  await context.modifyDynamicImports(imports => {
    imports.push(...scanned);
  });
  // Only value entries can replace another entry. An enum of the same file and name is kept too.
  const kept = new Set(
    (await context.getImports()).filter(entry => isValue(entry)).map(entry => key(entry)),
  );
  const registry = {
    ...makeRegistry(),
    // The resolved path of a preset is not a file, as `fetch` is not `fetch.js`.
    shadowedImports: await shadowedImports(context, path => path.replace('#app/', `${root}/nuxt/`)),
  };
  const layers = Array.from({ length: LAYERS }, (_, layer) =>
    makeLayer(`L${layer}`, join(root, `L${layer}`)),
  );
  const findings = shadowedFileFindings(registry, createOwnerLookup(layers), {});
  const all = [...presets, ...scanned];
  const expected = await Promise.all(
    scanned
      .filter(entry => isValue(entry) && !kept.has(key(entry)))
      .map(async entry => {
        const winner = all.find(
          other => isValue(other) && other.name === entry.name && kept.has(key(other)),
        );
        // Two files of the same layer are not reported (the safe side).
        if (winner === undefined || layerOf(winner.from) === layerOf(entry.from)) {
          return [];
        }
        // The truth for one pair: a unimport with only the two entries keeps only the winner.
        const pair = await used(
          presets.filter(preset => preset === winner),
          scanned.filter(other => other === entry || other === winner),
        );
        return pair.length === 1 && pair[0].from === winner.from
          ? [`${entry.name} ${entry.from} ${winner.from}`]
          : [];
      }),
  );
  const actual = findings.map(
    finding => `${finding.symbol} ${finding.file} ${finding.target ?? ''}`,
  );
  expect(actual.toSorted(), JSON.stringify({ presets, scanned })).toEqual(
    expected.flat().toSorted(),
  );
}

describe('the shadowed auto-imports, checked against a real unimport', () => {
  it('reports each value entry that unimport drops for an entry of another layer, and no other', async () => {
    const next = random(104);
    const cases = Array.from({ length: 150 }, (_, run) => {
      const root = join(top, String(run));
      const presets = NAMES.filter(() => next(3) === 0).map(name => ({
        name,
        // An import path without an extension, as the presets of Nuxt give it.
        from: '#app/composables/x',
        priority: [undefined, -1][next(2)],
      }));
      return { root, presets, scanned: entries(next, root) };
    });
    await Promise.all(
      cases.map(async ({ root, presets, scanned }) => {
        await check(root, presets, scanned);
      }),
    );
  });
});
