import { mkdirSync, readFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { measureDrift } from '#src/drift/index.ts';

import {
  FILE,
  commit,
  counts,
  drift,
  errorPage,
  findingsBaseline,
  repository,
  writeBaseline,
} from './drift-project.ts';
import { page, write } from './fix-project.ts';
import { git } from './git-project.ts';

const CART = 'layers/shop/app/pages/cart.vue';

/** A repository whose `main` has `cart.vue` with an accepted error, on a branch `change`. */
async function accepted(content = errorPage(false)): Promise<string> {
  const root = repository();
  write(root, CART, content);
  writeBaseline(root, FILE, (await findingsBaseline(root)).entries);
  commit(root, 'accept');
  git(root, 'switch', '-q', '-c', 'change');
  return root;
}

function rename(root: string, from: string, to: string): void {
  git(root, 'mv', from, to);
}

describe('drift with a renamed file', () => {
  it('counts nothing for a pure rename', async () => {
    const root = await accepted();
    rename(root, CART, 'layers/shop/app/pages/basket.vue');
    commit(root, 'rename');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });

  it('counts a new error in the renamed file, with the path of today', async () => {
    const root = await accepted();
    rename(root, CART, 'layers/shop/app/pages/basket.vue');
    write(
      root,
      'layers/shop/app/pages/basket.vue',
      `${errorPage(false)}<template><Cart /></template>\n`,
    );
    commit(root, 'rename and add');
    const result = await drift(root);
    expect(counts(result)).toEqual([1, 0]);
    expect(result.added.map(entry => [entry.file, entry.symbol])).toEqual([
      ['layers/shop/app/pages/basket.vue', 'Cart'],
    ]);
  });
});

describe('drift with a renamed import or a moved file', () => {
  // Git pairs a rename by how much of the file stays the same, so the page has more than one line.
  it('maps the relative import of a file that moved to another dir', async () => {
    const root = await accepted(
      `${errorPage(false)}<template>\n${'  <p>text</p>\n'.repeat(20)}</template>\n`,
    );
    const moved = 'layers/shop/app/pages/sub/cart.vue';
    mkdirSync(join(root, 'layers/shop/app/pages/sub'));
    rename(root, CART, moved);
    const text = readFileSync(join(root, moved), 'utf8');
    write(root, moved, text.replace("'../../../web/", "'../../../../web/"));
    commit(root, 'move');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });

  it('maps the relative import of a renamed import target', async () => {
    const root = await accepted();
    rename(
      root,
      'layers/web/app/composables/useCart.ts',
      'layers/web/app/composables/useBasket.ts',
    );
    write(root, CART, errorPage(false).replace('/useCart', '/useBasket'));
    commit(root, 'rename the target');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });
});

describe('drift with a rename that git finds or not', () => {
  it('counts a rename that git does not find as added and fixed', async () => {
    const root = await accepted();
    git(root, 'rm', '-q', CART);
    const lines = Array.from({ length: 40 }, (_, index) => `const value${index} = ${index};`);
    write(
      root,
      'layers/shop/app/pages/basket.vue',
      page(...lines, ...errorPage(false).split('\n').slice(1, -2)),
    );
    commit(root, 'rewrite');
    expect(counts(await drift(root))).toEqual([1, 1]);
  });

  it('finds the rename with diff.renames set to false', async () => {
    const root = await accepted();
    git(root, 'config', 'diff.renames', 'false');
    rename(root, CART, 'layers/shop/app/pages/basket.vue');
    commit(root, 'rename');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });

  it('reads a renamed baseline file at its old path on the base', async () => {
    const root = await accepted();
    rename(root, FILE, 'ci-baseline.json');
    commit(root, 'rename the baseline');
    const result = await measureDrift({ rootDir: root }, 'main', 'ci-baseline.json');
    expect(counts(result)).toEqual([0, 0]);
  });
});
