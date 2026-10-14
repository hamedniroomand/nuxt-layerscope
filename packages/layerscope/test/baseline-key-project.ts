import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';

import { readBaseline } from '#src/baseline/index.ts';

import { errorPage, repository } from './drift-project.ts';
import { write } from './fix-project.ts';

// A git project for the tests of the `baseline` key of the config.
export const KEY = 'ci/base.json';

/** Adds `baseline: <value>` to the config of `root`. `value` is source text. */
export function setKey(root: string, value: string): void {
  const file = join(root, 'layerscope.config.mjs');
  const source = readFileSync(file, 'utf8');
  writeFileSync(file, source.replace('export default {', `export default { baseline: ${value},`));
}

/** A git project whose config names `ci/base.json`, with one `layer-boundary` error. */
export function keyProject(): string {
  const root = repository();
  setKey(root, `'${KEY}'`);
  mkdirSync(join(root, 'ci'));
  write(root, 'layers/shop/app/pages/a.vue', errorPage(false));
  return root;
}

/** The number of entries in the baseline file that the key names. */
export const entries = (root: string): number => readBaseline(join(root, KEY))?.entries.length ?? 0;
