import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { glob } from 'tinyglobby';
import { describe, expect, it } from 'vite-plus/test';

import { collectFiles, isCheckedFile, skippedDirGlobs } from '#src/analyze/files.ts';
import { layerFromNuxt, layerFromPath } from '#src/nuxt/layer-factory.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { realPath } from '#src/utils/fs.ts';

/** A real dir and a symlink to it, as `/tmp` is on macOS. */
function symlinkedRoot(): { real: string; link: string } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-link-')));
  const real = join(base, 'real');
  const link = join(base, 'link');
  mkdirSync(real);
  symlinkSync(real, link);
  return { real, link };
}

/** Whether this file system tells `Shop` and `shop` apart. */
const caseSensitive = ((): boolean => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-probe-')));
  mkdirSync(join(base, 'shop'));
  return !existsSync(join(base, 'Shop'));
})();

describe('realPath', () => {
  it('resolves the symlinks of the nearest dir that exists', () => {
    const { real, link } = symlinkedRoot();
    expect(realPath(join(link, 'missing/deep/x.ts'))).toBe(join(real, 'missing/deep/x.ts'));
  });

  it('returns the path of an existing file as the real path', () => {
    const { real, link } = symlinkedRoot();
    mkdirSync(join(real, 'modules'));
    expect(realPath(join(link, 'modules'))).toBe(join(real, 'modules'));
  });

  // A case-sensitive file system (the Linux runner) has no `Shop`; the mocked tests cover it.
  it.skipIf(caseSensitive)(
    'gives the real case of a dir on a file system that ignores case',
    () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-case-')));
      mkdirSync(join(base, 'shop/app'), { recursive: true });
      expect(realPath(join(base, 'Shop/app'))).toBe(join(base, 'shop/app'));
    },
  );

  it('keeps a path that is not absolute as it is: it can be a module specifier', () => {
    expect(realPath('@iconify/vue')).toBe('@iconify/vue');
    expect(realPath('#app/x')).toBe('#app/x');
  });

  it('returns a path of a missing root as it is', () => {
    expect(realPath('/layerscope-missing-root/x')).toBe('/layerscope-missing-root/x');
  });
});

describe('a modules or public dir that is a symlink', () => {
  it('keeps the name of the dir, and both functions skip the files below it', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-dirlink-')));
    const root = join(base, 'proj');
    mkdirSync(join(base, 'assets/js'), { recursive: true });
    mkdirSync(join(root, 'components'), { recursive: true });
    writeFileSync(join(base, 'assets/js/sw.ts'), 'export const sw = 1;\n');
    writeFileSync(join(root, 'components/Card.ts'), 'export const card = 1;\n');
    symlinkSync(join(base, 'assets'), join(root, 'public'));
    const layer = layerFromPath('web', root);
    expect(layer.publicDir).toBe(join(root, 'public'));
    const files = await collectFiles([layer], createOwnerLookup([layer]), []);
    expect([...files.keys()]).toEqual([join(root, 'components/Card.ts')]);
    expect(isCheckedFile(join(root, 'public/js/sw.ts'), layer, [])).toBe(false);
    expect(isCheckedFile(join(root, 'components/Card.ts'), layer, [])).toBe(true);
  });
});

describe('the glob ignore of a skipped dir', () => {
  it('does not let a glob special character in the name skip a sibling dir', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-glob-')));
    mkdirSync(join(root, '(m)[x]'), { recursive: true });
    mkdirSync(join(root, 'mx'), { recursive: true });
    writeFileSync(join(root, '(m)[x]/skipped.ts'), 'export const a = 1;\n');
    writeFileSync(join(root, 'mx/kept.ts'), 'export const b = 1;\n');
    const layer = { ...layerFromPath('web', root), modulesDir: join(root, '(m)[x]') };
    // The walk alone, with only the globs of `skippedDirGlobs`: it stays out of the dir and it
    // does not leave out the sibling that an unescaped `(m)[x]/**` would match.
    const walked = await glob('**/*.ts', { cwd: root, ignore: skippedDirGlobs(root, layer) });
    expect(walked).toEqual(['mx/kept.ts']);
    const files = await collectFiles([layer], createOwnerLookup([layer]), []);
    expect([...files.keys()]).toEqual([join(root, 'mx/kept.ts')]);
  });

  it.skipIf(process.platform === 'win32')(
    'adds no glob for a dir with a backslash in its name, and still skips it',
    async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-backslash-')));
      mkdirSync(`${root}/m\\`, { recursive: true });
      mkdirSync(join(root, 'm'), { recursive: true });
      writeFileSync(`${root}/m\\/skipped.ts`, 'export const a = 1;\n');
      writeFileSync(join(root, 'm/kept.ts'), 'export const b = 1;\n');
      const layer = { ...layerFromPath('web', root), modulesDir: `${root}/m\\` };
      expect(skippedDirGlobs(root, layer)).toEqual(['public/**']);
      const files = await collectFiles([layer], createOwnerLookup([layer]), []);
      expect([...files.keys()]).toEqual([join(root, 'm/kept.ts')]);
    },
  );
});

describe('a symlink in the path of the modules dir', () => {
  it('keeps the path of a modules dir below a symlinked dir of the scanned dir', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-midlink-')));
    const root = join(base, 'proj');
    mkdirSync(join(base, 'libreal/modules'), { recursive: true });
    mkdirSync(root, { recursive: true });
    writeFileSync(join(base, 'libreal/modules/m.ts'), 'export const m = 1;\n');
    writeFileSync(join(base, 'libreal/ok.ts'), 'export const ok = 1;\n');
    symlinkSync(join(base, 'libreal'), join(root, 'lib'));
    const dirs = {
      root,
      app: root,
      server: join(root, 'server'),
      shared: join(root, 'shared'),
      modules: join(root, 'lib/modules'),
      public: join(root, 'public'),
    };
    const layer = layerFromNuxt({ cwd: root, config: {} }, 0, dirs);
    expect(layer.modulesDir).toBe(join(root, 'lib/modules'));
    const files = await collectFiles([layer], createOwnerLookup([layer]), []);
    expect([...files.keys()]).toEqual([join(root, 'lib/ok.ts')]);
    expect(isCheckedFile(join(root, 'lib/modules/m.ts'), layer, [])).toBe(false);
    expect(isCheckedFile(join(root, 'lib/ok.ts'), layer, [])).toBe(true);
  });
});

describe('layer dirs under a symlinked root', () => {
  it('put the modules and public dirs that do not exist yet under the real root', () => {
    const { real, link } = symlinkedRoot();
    const layer = layerFromPath('web', link);
    expect(layer.root).toBe(real);
    expect(layer.modulesDir).toBe(join(real, 'modules'));
    expect(layer.publicDir).toBe(join(real, 'public'));
  });
});

describe('a modules or public dir that is the scanned dir', () => {
  it.each(['modules', 'public'] as const)(
    'uses the real path of a symlinked srcDir for dir.%s equal to it',
    async kind => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-eqdir-')));
      const real = join(base, 'real');
      const link = join(base, 'link');
      mkdirSync(real);
      writeFileSync(join(real, 'm.ts'), 'export const m = 1;\n');
      symlinkSync(real, link);
      const dirs = {
        root: link,
        app: link,
        server: join(link, 'server'),
        shared: join(link, 'shared'),
        modules: kind === 'modules' ? link : join(link, 'modules'),
        public: kind === 'public' ? link : join(link, 'public'),
      };
      const layer = layerFromNuxt({ cwd: link, config: {} }, 0, dirs);
      expect(layer[`${kind}Dir`]).toBe(real);
      const files = await collectFiles([layer], createOwnerLookup([layer]), []);
      expect([...files.keys()]).toEqual([]);
      expect(isCheckedFile(join(real, 'm.ts'), layer, [])).toBe(false);
    },
  );
});
