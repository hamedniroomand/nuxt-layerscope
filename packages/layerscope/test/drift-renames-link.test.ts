import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

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
import { write } from './fix-project.ts';
import { git } from './git-project.ts';

const CART = 'layers/shop/app/pages/cart.vue';
const MOVED = 'layers/shop/app/pages/sub/cart.vue';
const LONG = `<template>\n${'  <p>text</p>\n'.repeat(20)}</template>\n`;

/**
 * A repository whose `main` has `cart.vue` with an accepted error through the import `written`,
 * which goes through a link that `link` makes, on a branch `change` where the page moved one dir
 * deeper.
 */
async function movedThroughLink(link: (root: string) => void, written: string): Promise<string> {
  const root = repository();
  link(root);
  write(root, CART, `${errorPage(false).replace('web/app/composables/useCart', written)}${LONG}`);
  writeBaseline(root, FILE, (await findingsBaseline(root)).entries);
  commit(root, 'accept');
  git(root, 'switch', '-q', '-c', 'change');
  mkdirSync(join(root, 'layers/shop/app/pages/sub'));
  git(root, 'mv', CART, MOVED);
  const text = readFileSync(join(root, MOVED), 'utf8');
  write(root, MOVED, text.replace("'../../../web/", "'../../../../web/"));
  commit(root, 'move');
  return root;
}

describe('drift with a moved file that imports through a link', () => {
  it('maps an import through a link to a file', async () => {
    const root = await movedThroughLink(dir => {
      symlinkSync('useCart.ts', join(dir, 'layers/web/app/composables/cart.v2.ts'));
    }, 'web/app/composables/cart.v2');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });

  it('maps an import through a link to a dir', async () => {
    const root = await movedThroughLink(dir => {
      symlinkSync('composables', join(dir, 'layers/web/app/lib.v2'));
    }, 'web/app/lib.v2/useCart');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });
});
