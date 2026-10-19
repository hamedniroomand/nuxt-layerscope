import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, run } from '#src/cli.ts';

import { NEW, OLD, applyArgs, commitAll, read, silence } from './fix-apply-project.ts';
import { ADMIN, SHARED, SHOP, WEB, cartProject, checkArgs, write } from './fix-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Each way to write an import of the file that moves. `%` stands for the old specifier. */
const FORMS: Record<string, [file: string, text: string]> = {
  'an import that spans lines': [
    'layers/admin/app/utils/f.ts',
    "import {\n  useCart,\n  // a comment\n} from '%';\nexport const a = useCart;\n",
  ],
  'a re-export': ['layers/admin/app/utils/f.ts', "export { useCart } from '%';\n"],
  'an export of everything': ['layers/admin/app/utils/f.ts', "export * from '%';\n"],
  'a dynamic import': ['layers/admin/app/utils/f.ts', "export const load = () => import('%');\n"],
  'a dynamic import with a template string': [
    'layers/admin/app/utils/f.ts',
    'export const load = () => import(`%`);\n',
  ],
  'an import with double quotes': [
    'layers/admin/app/utils/f.ts',
    'import { useCart } from "%";\nexport const a = useCart;\n',
  ],
  'a type import': [
    'layers/admin/app/utils/f.ts',
    "import type { useCart as Cart } from '%';\nexport type Same = typeof Cart;\n",
  ],
  'a script setup below a template': [
    'layers/admin/app/pages/f.vue',
    '<template>\n  <div />\n</template>\n\n<script setup lang="ts">\nimport {\n  useCart,\n} from \'%\';\nuseCart();\n</script>\n',
  ],
  'an import() in a template on its own line': [
    'layers/admin/app/pages/f.vue',
    '<template>\n  <button @click="() => import(\n    \'%\'\n  )" />\n</template>\n',
  ],
  'a file with CRLF line ends': [
    'layers/admin/app/utils/f.ts',
    "import { useCart } from '%';\r\nexport const a = useCart;\r\n",
  ],
  'a file with text before the import that is not ASCII': [
    'layers/admin/app/utils/f.ts',
    "// ünïcödé 😀 ☃\nimport { useCart } from '%'; // 日本語\nexport const a = useCart;\n",
  ],
  'two imports of the same file on one line': [
    'layers/admin/app/utils/f.ts',
    "import { useCart as a } from '%'; import { useCart as b } from '%';\nexport const c = [a, b];\n",
  ],
};

describe('fix --apply writes the specifier in each form of an import', () => {
  it.each(Object.entries(FORMS))('rewrites %s', async (_name, [file, template]) => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    write(root, file, template.replaceAll('%', OLD));
    commitAll(root);
    silence();
    expect(await run(applyArgs(root))).toBe(EXIT_CLEAN);
    expect(read(root, file)).toBe(template.replaceAll('%', NEW));
    vi.restoreAllMocks();
    silence();
    expect(await run(checkArgs(root))).toBe(EXIT_CLEAN);
  });
});

describe('fix --apply and an import() in a template', () => {
  it('rewrites the import, not a string before it with the same text', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    const file = 'layers/admin/app/pages/f.vue';
    const text = `<template>\n  <p>{{ "import('${OLD}')" }}</p>\n  <button @click="() => import('%')" />\n</template>\n`;
    write(root, file, text.replaceAll('%', OLD));
    commitAll(root);
    silence();
    expect(await run(applyArgs(root))).toBe(EXIT_CLEAN);
    expect(read(root, file)).toBe(text.replaceAll('%', NEW));
  });
});
