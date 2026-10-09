import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** The text of a page that imports `from`; an import that does not resolve is a finding. */
export function page(from: string): string {
  return `<script setup lang="ts">\nimport thing from "${from}";\nconsole.log(thing);\n</script>\n`;
}

/** A project with one layer and `count` pages that resolve, without a Nuxt registry. */
export function project(count = 1): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-watch-')));
  write(root, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(root, 'layerscope.config.mjs', "export default { layers: { a: { path: 'layers/a' } } };\n");
  write(root, 'layers/a/app/helper.ts', 'export default 1;\n');
  for (let index = 0; index < count; index += 1) {
    write(root, `layers/a/app/pages/p${index}.vue`, page('../helper'));
  }
  return root;
}
