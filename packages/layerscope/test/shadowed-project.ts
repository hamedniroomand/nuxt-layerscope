import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { onTestFinished } from 'vite-plus/test';

import type { Nuxt } from '#src/module/nuxt.ts';

/** A project with a root layer and a `base` layer, with empty files at the paths. */
export function shadowedProject(files: string[]): { root: string; base: string } {
  const root = mkdtempSync(join(tmpdir(), 'layerscope-shadowed-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), '');
  }
  return { root, base: join(root, 'layers/base') };
}

/** The slice of Nuxt that the module reads for the shadowed files: two layers and the app. */
export function shadowedNuxt(
  project: { root: string; base: string },
  app: object,
  pages?: unknown,
): Nuxt {
  const layer = (dir: string): object => ({
    cwd: dir,
    config: { rootDir: dir, srcDir: join(dir, 'app') },
  });
  return {
    apps: { default: app },
    options: {
      rootDir: project.root,
      srcDir: join(project.root, 'app'),
      extensions: ['.ts', '.vue'],
      ignore: [],
      pages,
      _layers: [layer(project.root), layer(project.base)],
    },
  } as unknown as Nuxt;
}
