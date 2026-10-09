import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';

/** Runs `layerscope check` and returns what it writes to stdout. */
export async function check(root: string, ...args: string[]): Promise<string> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  await run(['node', 'layerscope', 'check', root, ...args]);
  const text = out.mock.calls.map(call => String(call[0])).join('');
  vi.restoreAllMocks();
  return text;
}

export function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-ci-')));
}

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** A project in `web/` of a temp directory, with or without a git repository. */
export function copyProject(withGit: boolean): { repo: string; project: string } {
  const repo = tempDir();
  const project = join(repo, 'web');
  write(project, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
  write(project, '.nuxt/components.d.ts', '\n');
  write(
    project,
    'layerscope.config.mjs',
    "export default { layers: { a: { path: 'layers/a' } } };\n",
  );
  // The import cannot be resolved, which is a finding without a Nuxt registry.
  write(
    project,
    'layers/a/app/pages/a.vue',
    '<script setup lang="ts">\nimport thing from "./missing";\nconsole.log(thing);\n</script>\n',
  );
  if (withGit) {
    execFileSync('git', ['init', '-q'], { cwd: repo });
  }
  return { repo, project };
}
