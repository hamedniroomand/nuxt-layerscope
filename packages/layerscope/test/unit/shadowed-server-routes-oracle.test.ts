import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { resolveModule } from '@nuxt/kit';
import { extname, join, relative } from 'pathe';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import type { Nitro, NitroHandler } from '#src/module/nuxt.ts';
import { shadowedServerRoutes } from '#src/module/shadowed-files.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/** A small seeded random source, so that a failure gives the same input again. */
function random(seed: number): (max: number) => number {
  let state = seed;
  return max => {
    state = (state * 48_271) % 2_147_483_647;
    return state % max;
  };
}

type ScanHandlers = (nitro: Nitro) => Promise<NitroHandler[]>;

/** `scanHandlers` of the nitropack that the Nuxt of the fixture uses. */
async function loadScanHandlers(): Promise<ScanHandlers> {
  const nuxt = resolveModule('nuxt', { url: pathToFileURL(join(NUXT4_ROOT, 'package.json')) });
  const server = resolveModule('@nuxt/nitro-server', { url: pathToFileURL(nuxt) });
  const nitropack = resolveModule('nitropack', { url: pathToFileURL(server) });
  const loaded = (await import(pathToFileURL(nitropack).href)) as { scanHandlers: ScanHandlers };
  return loaded.scanHandlers;
}

const PARTS = [
  // `routes/api/hello` gives the same route as `api/hello`, and `routes/hello` another route.
  ['api/', 'routes/', 'routes/api/'],
  ['', '(g)/'],
  ['hello', 'hello/index', '[id]'],
  ['', '.get'],
  ['', '.dev'],
  ['.ts', '.js'],
];
const LAYERS = 3;
const top = mkdtempSync(join(tmpdir(), 'layerscope-routes-oracle-'));
afterAll(() => {
  rmSync(top, { recursive: true, force: true });
});

/** Random route files in up to three layers. */
function routeFiles(next: (max: number) => number, root: string): string[] {
  const files = new Set<string>();
  for (const _ of Array.from({ length: next(10) + 2 })) {
    const name = PARTS.map(options => options[next(options.length)]).join('');
    files.add(join(root, `L${next(LAYERS)}`, 'server', name));
  }
  return [...files];
}

function sameRoute(a: NitroHandler, b: NitroHandler): boolean {
  return a.route === b.route && a.method === b.method && a.env === b.env;
}

/** The server dir of a file, and the path of the file in it without the extension. */
function placeOf(file: string, dirs: string[]): { dir: string; key: string } {
  const dir = dirs.find(entry => file.startsWith(`${entry}/`)) ?? '';
  const path = relative(dir, file);
  return { dir, key: path.slice(0, path.length - extname(path).length) };
}

/** Two files with the same path in two server dirs. */
function samePath(a: string, b: string, dirs: string[]): boolean {
  const [first, second] = [placeOf(a, dirs), placeOf(b, dirs)];
  return first.dir !== second.dir && first.key === second.key;
}

/** Checks one random project: the reported routes, and the dropped routes that are not reported. */
async function check(scanHandlers: ScanHandlers, root: string, files: string[]): Promise<number> {
  for (const file of files) {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, '');
  }
  const scanDirs = Array.from({ length: LAYERS }, (_, layer) => join(root, `L${layer}`, 'server'));
  const nitro: Nitro = { options: { scanDirs, ignore: [] } };
  // Nitro's own scan: it gives every route file, and keeps the ones that it uses.
  const all = await scanHandlers(nitro);
  const used = (nitro.scannedHandlers ?? []).filter(handler => handler.middleware !== true);
  const found = await shadowedServerRoutes(nitro);
  const context = JSON.stringify({ files, found });
  // Each reported file is a route file that Nitro drops, for the file in `shadowedBy`.
  for (const entry of found) {
    const loser = all.find(handler => handler.handler === entry.file);
    const winner = used.find(handler => handler.handler === entry.shadowedBy);
    expect(loser, context).toBeDefined();
    expect(winner, context).toBeDefined();
    expect(
      used.some(handler => handler.handler === entry.file),
      context,
    ).toBe(false);
    expect(sameRoute(loser ?? { handler: '' }, winner ?? { handler: '' }), context).toBe(true);
  }
  // Each file that Nitro drops for a file with the same path in another server dir is reported.
  for (const loser of all.filter(
    handler => !used.some(other => other.handler === handler.handler),
  )) {
    const winner = used.find(handler => sameRoute(handler, loser));
    const expected =
      winner !== undefined && samePath(winner.handler, loser.handler, scanDirs)
        ? winner.handler
        : undefined;
    const reported = found.find(entry => entry.file === loser.handler);
    expect(reported?.shadowedBy, context).toBe(expected);
  }
  return found.length;
}

describe('the shadowed server routes, checked against the scan of Nitro', () => {
  it('reports each route that Nitro drops for the same path in another layer, and no other', async () => {
    const scanHandlers = await loadScanHandlers();
    const next = random(219);
    const cases = Array.from({ length: 100 }, (_, run) => {
      const root = join(top, String(run));
      return { root, files: routeFiles(next, root) };
    });
    const counts = await Promise.all(
      cases.map(async ({ root, files }) => {
        const count = await check(scanHandlers, root, files);
        return count;
      }),
    );
    // The random input must give overridden routes, else the checks above prove nothing.
    expect(counts.reduce((sum, count) => sum + count, 0)).toBeGreaterThan(10);
  });
});
