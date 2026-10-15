import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { renamesSince } from '#src/drift/git.ts';

import { FILE, commit, counts, drift, findingsBaseline, writeBaseline } from './drift-project.ts';
import { ADMIN, CART, SHARED, SHOP, WEB, applyPlan, cartProject } from './fix-project.ts';
import { git, gitProject } from './git-project.ts';

describe('drift after fix --apply', () => {
  // `fix` moves useCart.ts from web to shared, which admin and shop may use. The file keeps an
  // accepted error of its own, and the imports of admin and shop are rewritten.
  it('counts the fixed imports, and no error for the moved file', async () => {
    const root = cartProject([SHARED, WEB, ADMIN, SHOP]);
    writeFileSync(
      join(root, 'layerscope.config.mjs'),
      `export default { layers: { ${[SHARED, WEB, ADMIN, SHOP].join(', ')} }, rules: { 'unresolved-reference': 'error' } };\n`,
    );
    writeFileSync(
      join(root, CART),
      `export const useCart = () => missingThing();\n${'// note\n'.repeat(10)}`,
    );
    writeFileSync(join(root, '.gitignore'), '.nuxt\n');
    git(root, 'init', '-q', '-b', 'main');
    writeBaseline(root, FILE, (await findingsBaseline(root)).entries);
    commit(root, 'accept');
    git(root, 'switch', '-q', '-c', 'change');
    await applyPlan(root);
    commit(root, 'fix');
    const result = await drift(root);
    expect(git(root, 'diff', '-M', '--name-status', 'main')).toContain(
      'layers/shared/app/composables/useCart.ts',
    );
    expect(counts(result)).toEqual([0, 2]);
  });
});

describe('renamesSince', () => {
  it('keeps a rename in the root, with paths relative to the root, and not one that leaves it', () => {
    const project = gitProject({ nested: true });
    project.write('apps/web/a.ts', `${'export const a = 1;\n'.repeat(5)}`);
    project.write('apps/web/out.ts', `${'export const b = 1;\n'.repeat(5)}`);
    project.commit('files');
    const repo = join(project.root, '../..');
    git(repo, 'mv', 'apps/web/a.ts', 'apps/web/b.ts');
    git(repo, 'mv', 'apps/web/out.ts', 'apps/other/out.ts');
    expect([...renamesSince(project.root, 'HEAD')]).toEqual([['b.ts', 'a.ts']]);
  });
});
