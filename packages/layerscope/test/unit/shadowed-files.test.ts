import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { Nuxt } from '#src/module/nuxt.ts';
import { recordShadowedFiles, shadowedFiles } from '#src/module/shadowed-files.ts';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('shadowedFiles', () => {
  const ROOT = { layer: 0, file: '/p/app/layouts/default.vue', key: 'default' };
  const BASE = { layer: 1, file: '/p/base/app/layouts/default.vue', key: 'default' };

  it('gives a file that Nuxt does not use, with the winner of the same key in another layer', () => {
    expect(shadowedFiles([ROOT, BASE], [{ name: 'default', file: ROOT.file }])).toEqual([
      { name: 'default', file: BASE.file, shadowedBy: ROOT.file },
    ]);
  });

  it('takes the name from the winner', () => {
    const [entry] = shadowedFiles([ROOT, BASE], [{ name: 'main', file: ROOT.file }]);
    expect(entry.name).toBe('main');
  });

  it('gives nothing for a file with no winner of the same key', () => {
    // Nuxt gives `Default.vue` and `default.vue` the same name, but the keys are not the same.
    const other = { ...BASE, file: '/p/base/app/layouts/Default.vue', key: 'Default' };
    expect(shadowedFiles([ROOT, other], [{ name: 'default', file: ROOT.file }])).toEqual([]);
  });

  it('gives nothing when the winner is in the same layer', () => {
    const twin = { ...ROOT, file: '/p/app/layouts/default.ts' };
    expect(shadowedFiles([ROOT, twin], [{ name: 'default', file: ROOT.file }])).toEqual([]);
  });

  it('gives nothing when the winner is in a layer with a lower priority', () => {
    expect(shadowedFiles([ROOT, BASE], [{ name: 'default', file: BASE.file }])).toEqual([]);
  });

  it('gives nothing when Nuxt uses each file', () => {
    const winners = [
      { name: 'default', file: ROOT.file },
      { name: 'default', file: BASE.file },
    ];
    expect(shadowedFiles([ROOT, BASE], winners)).toEqual([]);
  });

  it('gives nothing when the two paths are one file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'layerscope-shadowed-'));
    created.push(dir);
    const target = join(dir, 'default.vue');
    const link = join(dir, 'link.vue');
    writeFileSync(target, '');
    symlinkSync(target, link);
    const winner = { ...ROOT, file: target };
    const loser = { ...BASE, file: link };
    expect(shadowedFiles([winner, loser], [{ name: 'default', file: target }])).toEqual([]);
  });
});

/** A project with a root layer and a `base` layer, with empty files at the paths. */
function project(files: string[]): { root: string; base: string } {
  const root = mkdtempSync(join(tmpdir(), 'layerscope-shadowed-'));
  created.push(root);
  const base = join(root, 'layers/base');
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), '');
  }
  return { root, base };
}

function fakeNuxt(
  root: string,
  base: string,
  app: { layouts: Record<string, { name: string; file: string }>; middleware: object[] },
): Nuxt {
  const layer = (dir: string): object => ({
    cwd: dir,
    config: { rootDir: dir, srcDir: join(dir, 'app') },
  });
  return {
    apps: { default: app },
    options: {
      rootDir: root,
      srcDir: join(root, 'app'),
      extensions: ['.ts', '.vue'],
      ignore: [],
      _layers: [layer(root), layer(base)],
    },
  } as unknown as Nuxt;
}

describe('recordShadowedFiles', () => {
  it('scans the layouts in sub dirs and the middleware of each layer', async () => {
    const { root, base } = project([
      'app/layouts/admin/wide.vue',
      'layers/base/app/layouts/admin/wide.vue',
      'app/middleware/auth.ts',
      'layers/base/app/middleware/auth.ts',
    ]);
    const nuxt = fakeNuxt(root, base, {
      layouts: {
        'admin-wide': { name: 'admin-wide', file: join(root, 'app/layouts/admin/wide.vue') },
      },
      middleware: [{ name: 'auth', path: join(root, 'app/middleware/auth.ts') }],
    });
    expect(await recordShadowedFiles(nuxt, path => path)).toEqual({
      layouts: [
        {
          name: 'admin-wide',
          file: join(base, 'app/layouts/admin/wide.vue'),
          shadowedBy: join(root, 'app/layouts/admin/wide.vue'),
        },
      ],
      middleware: [
        {
          name: 'auth',
          file: join(base, 'app/middleware/auth.ts'),
          shadowedBy: join(root, 'app/middleware/auth.ts'),
        },
      ],
    });
  });

  it('gives nothing before Nuxt adds the app', async () => {
    const nuxt = { apps: {} } as unknown as Nuxt;
    expect(await recordShadowedFiles(nuxt, path => path)).toEqual({ layouts: [], middleware: [] });
  });
});
