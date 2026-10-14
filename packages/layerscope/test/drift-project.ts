import { rmSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_VERSION, baselineSize, createBaseline } from '#src/baseline/index.ts';
import type { Baseline } from '#src/baseline/index.ts';
import type { Drift } from '#src/drift/index.ts';
import { measureDrift } from '#src/drift/index.ts';
import type { BaselineEntry } from '#src/types.ts';

import { empty, page, write } from './fix-project.ts';
import { check, git } from './git-project.ts';

// A git project with two layers for the tests of `drift`: shop may not use web.
export const FILE = 'layerscope-baseline.json';
const LAYERS = "web: { path: 'layers/web', allow: [] }, shop: { path: 'layers/shop', allow: [] }";
const CART = "import { useCart } from '../../../web/app/composables/useCart';";
// The name Cart is an auto-import and a component of the web layer. A file that uses both has two
// findings with one key.
const IMPORTS =
  "export {}\ndeclare global {\n  const Cart: typeof import('../../layers/web/app/composables/Cart').Cart\n}\n";
const COMPONENTS = `export {}\nexport const Cart: typeof import("../layers/web/app/components/Cart.vue")['default']\n`;
const TWICE = '<script setup lang="ts">\nCart();\n</script>\n<template><Cart /></template>\n';

/**
 * A `layer-boundary` error, or two errors with one key when `twice` is set, unless the config sets
 * `layer-boundary` to `warn` or `off`.
 */
export const errorPage = (twice: boolean): string => (twice ? TWICE : page(CART, 'useCart();'));
/** An `unresolved-reference` finding, a warning unless the config sets the rule to `error`. */
export const warningPage = (index: number): string =>
  page(`import thing from './missing-${index}';`, 'console.log(thing);');

export function setRules(root: string, rules: string): void {
  writeFileSync(
    join(root, 'layerscope.config.mjs'),
    `export default { layers: { ${LAYERS} }, rules: { ${rules} } };\n`,
  );
}

export function commit(root: string, message: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', message);
}

/** A repository on `main` with useCart in the web layer and no pages. */
export function repository(rules = ''): string {
  const root = empty(LAYERS);
  setRules(root, rules);
  write(root, '.gitignore', '.nuxt\nbase-baseline.json\n');
  write(root, 'layers/web/app/composables/useCart.ts', 'export const useCart = () => 1;\n');
  write(root, 'layers/web/app/composables/Cart.ts', 'export const Cart = () => 1;\n');
  write(root, 'layers/web/app/components/Cart.vue', '<template><b /></template>\n');
  write(root, '.nuxt/types/imports.d.ts', IMPORTS);
  write(root, '.nuxt/components.d.ts', COMPONENTS);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, 'start');
  return root;
}

export function writeBaseline(root: string, file: string, entries: BaselineEntry[]): void {
  writeFileSync(join(root, file), JSON.stringify({ version: BASELINE_VERSION, entries }));
}

export async function findingsBaseline(root: string): Promise<Baseline> {
  return createBaseline((await analyze({ rootDir: root })).findings, root);
}

export async function drift(root: string): Promise<Drift> {
  const result = await measureDrift({ rootDir: root }, 'main', FILE);
  return result;
}

export const counts = (result: Drift): number[] => [
  baselineSize(result.added),
  baselineSize(result.fixed),
];

export interface CheckErrors {
  /** Errors that the baseline does not accept: `check` fails for them. */
  open: number;
  /** Errors that the baseline accepts. */
  accepted: number;
}

/** The errors that `check` reports with the baseline of `main`, in the working tree. */
export async function checkErrors(root: string, base: BaselineEntry[]): Promise<CheckErrors> {
  writeBaseline(root, 'base-baseline.json', base);
  const result = await check([root, '--format', 'json', '--baseline', 'base-baseline.json']);
  rmSync(join(root, 'base-baseline.json'));
  type Listed = { severity: string }[];
  const report = JSON.parse(result.out) as { findings: Listed; baseline: { suppressed: Listed } };
  const errors = (findings: Listed): number =>
    findings.filter(finding => finding.severity === 'error').length;
  return { open: errors(report.findings), accepted: errors(report.baseline.suppressed) };
}
