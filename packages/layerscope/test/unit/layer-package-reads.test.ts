import { mkdirSync, rmSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { resolveSpecifier } from '#src/resolve/specifier.ts';
import { KIT, UI_STORE, analyzeProject, packagesOf, project } from '#test/layer-package-project.ts';

/**
 * The error that `readJson` throws for each read of a file that ends with `failing.suffix`, until
 * `afterEach` clears the suffix.
 */
const failing = vi.hoisted(() => ({ suffix: '', code: '' }));

vi.mock(import('#src/utils/fs.ts'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    readJson: (path: string): unknown => {
      if (failing.suffix !== '' && path.endsWith(failing.suffix)) {
        throw Object.assign(new Error(`${failing.code}: the fs message, open '${path}'`), {
          code: failing.code,
        });
      }
      return actual.readJson(path);
    },
  };
});

afterEach(() => {
  failing.suffix = '';
});

/**
 * A bare import of a layer whose `main` has no extension, so Node finds no file and only the
 * lookup of `main` finds it. The result shows whether that lookup ran after the second read.
 */
function resolveAfterSecondRead(code: string): () => unknown {
  const root = project({
    [`${UI_STORE}/package.json`]: JSON.stringify({ name: '@acme/ui-layer', main: './nuxt.config' }),
  });
  const from = join(root, 'layers/admin/app/utils/use.ts');
  failing.suffix = `${UI_STORE}/package.json`;
  failing.code = code;
  return () => resolveSpecifier('@acme/ui-layer', from, [], join(root, '.nuxt'), packagesOf(root));
}

describe('a package.json of a layer that the second read cannot read', () => {
  it('makes the import missing when the file is gone', () => {
    expect(resolveAfterSecondRead('ENOENT')()).toEqual({ kind: 'missing' });
    expect(resolveAfterSecondRead('ENOTDIR')()).toEqual({ kind: 'missing' });
  });

  it('stops the run with the code as the reason for another fs error', () => {
    expect(resolveAfterSecondRead('EACCES')).toThrow(
      /^Cannot read the package\.json of layer "ui" \(.+\/package\.json\): EACCES$/u,
    );
  });
});

describe('a package.json of a layer that cannot be read when the run starts', () => {
  it('stops the run with the code as the reason', async () => {
    const root = project();
    const file = join(root, KIT, 'package.json');
    rmSync(file);
    mkdirSync(file);
    await expect(analyzeProject(root)).rejects.toThrow(
      /^Cannot read the package\.json of layer "kit" \(.+\/package\.json\): EISDIR$/u,
    );
  });
});
