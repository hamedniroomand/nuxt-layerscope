import { symlinkSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';

import { project, removeProjects, write } from './init-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
  removeProjects();
});

const COMPONENT = '<template><div /></template>\n';

/** Runs `check --source types`, so the stale check has no registry. */
async function checkTypes(root: string): Promise<{ code: number; stderr: string }> {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', 'check', root, '--source', 'types']);
  const stderr = err.mock.calls.map(call => String(call[0])).join('');
  vi.restoreAllMocks();
  return { code, stderr };
}

describe('the stale check of the types source and the ignore rules of Nuxt', () => {
  it('skips a component file with the ignore prefix', async () => {
    const root = project({ files: [['app/components/-Draft.vue', COMPONENT]] });
    expect((await checkTypes(root)).code).toBe(EXIT_CLEAN);
  });

  it('skips a component file that .nuxtignore names', async () => {
    const root = project({
      files: [
        ['app/components/Hidden.vue', COMPONENT],
        ['.nuxtignore', 'app/components/Hidden.vue\n'],
      ],
    });
    expect((await checkTypes(root)).code).toBe(EXIT_CLEAN);
  });

  it('still stops on a new component file that Nuxt does not ignore', async () => {
    const root = project({ files: [['app/components/New.vue', COMPONENT]] });
    const { code, stderr } = await checkTypes(root);
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain(
      `${join(root, 'app/components/New.vue')} is missing from components.d.ts`,
    );
  });

  it('reads the rules from the real path of a layer behind a symlink', async () => {
    const root = project({
      files: [
        ['nuxt.config.ts', "export default defineNuxtConfig({ extends: ['./linked-ui'] });\n"],
        ['packages/ui/nuxt.config.ts', 'export default defineNuxtConfig({});\n'],
        ['packages/ui/app/components/Hidden.vue', COMPONENT],
        // A path from the layer root: it matches only when the root of the layer is known.
        ['.nuxtignore', 'app/components/Hidden.vue\n'],
      ],
    });
    symlinkSync(join(root, 'packages/ui'), join(root, 'linked-ui'));
    write(root, 'app/components/.keep', '');
    expect((await checkTypes(root)).code).toBe(EXIT_CLEAN);
  });
});
