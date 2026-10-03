import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

import { DEVTOOLS_ROUTE } from '#src/devtools/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const PROBE = fileURLToPath(new URL('devtools-nuxt.ts', import.meta.url));

interface Registered {
  routes: (string | undefined)[];
  tabs: unknown[];
  publicAssets: number;
}

/** Loads the fixture with the module in a child process; see `devtools-nuxt.ts` for why. */
async function registered(mode: 'dev' | 'build' | 'static'): Promise<Registered> {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(process.execPath, [PROBE, NUXT4_ROOT, mode], (error, out, err) => {
      if (error === null) {
        resolve(out);
      } else {
        reject(new Error(`The Nuxt probe failed: ${err}`, { cause: error }));
      }
    });
  });
  return JSON.parse(stdout) as Registered;
}

describe('devtools tab', () => {
  it('registers the tab and its dev route under nuxi dev, and rescans without error', async () => {
    const { routes, tabs } = await registered('dev');
    expect(routes).toContain(DEVTOOLS_ROUTE);
    expect(tabs).toContainEqual(
      expect.objectContaining({
        name: 'layerscope',
        view: { type: 'iframe', src: DEVTOOLS_ROUTE },
      }),
    );
  });

  it('registers no route, no tab and no snapshot outside nuxi dev by default', async () => {
    const [plain, snapshot] = await Promise.all([registered('build'), registered('static')]);
    expect(plain.routes).not.toContain(DEVTOOLS_ROUTE);
    expect(plain.tabs).toEqual([]);
    // `{ static: true }` adds exactly the one hook that writes the snapshot.
    expect(snapshot.publicAssets).toBe(plain.publicAssets + 1);
    expect(snapshot.routes).not.toContain(DEVTOOLS_ROUTE);
  });
});
