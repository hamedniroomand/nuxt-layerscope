import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const made: string[] = [];

/** Removes the projects that `project` made. Call it from an `afterEach`. */
export function removeProjects(): void {
  for (const root of made.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

export interface Shape {
  /** `buildDir` of `nuxt.config`. */
  nuxtBuildDir?: string;
  /** The folders that hold generated types. `.nuxt` when left out. */
  dataIn?: string[];
  /** The files of the project, as [path, content]. */
  files?: [string, string][];
}

/** A project with the Nuxt install of the fixture and generated types in the given folders. */
export function project(shape: Shape = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-init-dir-')));
  made.push(root);
  symlinkSync(join(NUXT4_ROOT, 'node_modules'), join(root, 'node_modules'));
  write(root, 'package.json', '{ "name": "init-dir", "private": true }\n');
  const buildDir = shape.nuxtBuildDir === undefined ? '' : `buildDir: '${shape.nuxtBuildDir}', `;
  write(root, 'nuxt.config.ts', `export default defineNuxtConfig({ ${buildDir}});\n`);
  write(root, 'app/pages/index.vue', '<template><div /></template>\n');
  for (const dir of shape.dataIn ?? ['.nuxt']) {
    write(root, `${dir}/types/imports.d.ts`, 'export {}\n');
    write(root, `${dir}/components.d.ts`, '\n');
  }
  for (const [path, content] of shape.files ?? []) {
    write(root, path, content);
  }
  return root;
}

export interface Output {
  code: number;
  stdout: string;
  stderr: string;
}

export async function init(root: string, ...args: string[]): Promise<Output> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', 'init', root, ...args]);
  const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
  const output = { code, stdout: text(out), stderr: text(err) };
  vi.restoreAllMocks();
  return output;
}

/** The line that `--verbose` prints for the types folder that was read. */
export const readFrom = (root: string, dir: string): string =>
  `(${relative(process.cwd(), join(root, dir, 'types'))})`;

export const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');
