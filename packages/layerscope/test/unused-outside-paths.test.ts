import { existsSync, symlinkSync } from 'node:fs';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { isBelowRoot, isOutsideRoot } from '#src/nuxt/package-layer.ts';
import { findUnused } from '#src/unused/index.ts';
import { isOutsideDir } from '#src/utils/fs.ts';

import { makeLayer } from './factories.ts';
import { write, writeProject } from './unused-extra-project.ts';
import { outsideProject } from './unused-outside-project.ts';

async function names(root: string): Promise<string[]> {
  const result = await analyze({ rootDir: root, extraFiles: true });
  return findUnused(result).map(symbol => symbol.name);
}

const layer = (root: string): ReturnType<typeof makeLayer> => makeLayer('x', root);

describe('where the project root ends (path edge cases)', () => {
  it('has the layer root equal to the project root inside', () => {
    expect(isOutsideRoot(layer('/p/app'), '/p/app')).toBe(false);
  });

  it('has a layer in a sub dir inside', () => {
    expect(isOutsideRoot(layer('/p/app/layers/web'), '/p/app')).toBe(false);
  });

  it('has a dir that only starts with the same text outside', () => {
    expect(isOutsideRoot(layer('/p/app-ui'), '/p/app')).toBe(true);
  });

  it('has a layer below the root `/` or `C:/` inside, without a double slash', () => {
    expect(isOutsideRoot(layer('/p/app'), '/')).toBe(false);
    expect(isOutsideRoot(layer('C:/p/app'), 'C:/')).toBe(false);
    expect(isOutsideRoot(layer('/'), '/')).toBe(false);
  });

  it('does not have the root `/` below itself', () => {
    expect(isBelowRoot(layer('/'), '/')).toBe(false);
    expect(isBelowRoot(layer('C:/'), 'C:/')).toBe(false);
    expect(isBelowRoot(layer('/p'), '/')).toBe(true);
  });

  it('has a layer of another drive outside the root `C:/`', () => {
    expect(isOutsideRoot(layer('D:/p/app'), 'C:/')).toBe(true);
  });

  it('has a sibling dir outside', () => {
    expect(isOutsideRoot(layer('/p/packages/ui'), '/p/app')).toBe(true);
  });
});

describe('paths that the real path settles (path edge cases)', () => {
  it('settles a trailing slash in the root that the user gives', async () => {
    const root = outsideProject();
    expect(await names(`${root}/`)).toEqual(['useLocalUnused']);
  });

  it('settles a link: a layer path that links to a dir outside the root is outside', async () => {
    const root = outsideProject();
    symlinkSync(join(dirname(root), 'packages/ui'), join(root, 'layers/ui-link'));
    write(
      root,
      'layerscope.config.mjs',
      "export default { layers: { web: { path: 'layers/web' }, ui: { path: 'layers/ui-link' } } };\n",
    );
    expect(await names(root)).toEqual(['useLocalUnused']);
  });

  it('settles a link: a layer path that links to a dir inside the root is inside', async () => {
    const root = writeProject(
      { 'layers/real/app/composables/useReal.ts': 'export const useReal = () => 1;\n' },
      { useReal: 'layers/real/app/composables/useReal.ts' },
      "{ layers: { real: { path: 'layers/alias' } } }",
    );
    symlinkSync(join(root, 'layers/real'), join(root, 'layers/alias'));
    expect(await names(root)).toEqual(['useReal']);
  });

  it.skipIf(!existsSync(process.cwd().toUpperCase()))(
    'settles the case of the root on a file system that ignores case',
    async () => {
      const root = outsideProject();
      expect(await names(root.toUpperCase())).toEqual(['useLocalUnused']);
    },
  );
});

describe('isOutsideDir', () => {
  it('counts no dir as outside a project root of / or C:/, and keeps the test for a normal root', () => {
    expect(isOutsideDir('/', '/')).toBe(false);
    expect(isOutsideDir('/srv/app', '/')).toBe(false);
    expect(isOutsideDir('C:/work/app', 'C:/')).toBe(false);
    expect(isOutsideDir('/p/app/layers/web', '/p/app')).toBe(false);
    expect(isOutsideDir('/p/app-ui', '/p/app')).toBe(true);
  });
});
