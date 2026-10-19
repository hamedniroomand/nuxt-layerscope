import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';

import { NEW, OLD, applyArgs, commitAll, read, silence } from './fix-apply-project.ts';
import { ADMIN, SHARED, SHOP, WEB, cartProject, write } from './fix-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const FILE = 'layers/admin/app/pages/f.vue';
const NOT_AT_PLACE = `does not have "${OLD}" at the place that layerscope found. If the file changed, run the command again. If not, layerscope cannot find the exact place of this import() in the template, for example when the same expression has an HTML character reference. Move the import() into a function in <script setup>, then run the command again.`;
const ENTITY_QUOTE = `uses an HTML character reference, such as &quot;, as the quote of "${OLD}". Use ' or " as the quote, then run the command again.`;

/**
 * A string in a template literal with the same text as the import after it. Each `&amp;` is 4
 * characters longer than the `&` that Vue reads, so the mappings after them are too early. The
 * count of them makes the mapping fall on the path in the string.
 */
function decoy(): string {
  const between = `'${OLD}')` + '` + b + import(';
  const pad = ' '.repeat((4 - (between.length % 4)) % 4);
  const count = (between.length + pad.length) / 4;
  return `<template>\n  <div :x="\`${'&amp;'.repeat(count)}b + import('%')${pad}\` + b + import('%')" />\n</template>\n`;
}

/** Writes the page with `%` as the old specifier, and runs `fix --apply`. */
async function apply(text: string): Promise<{ code: number; stderr: string; root: string }> {
  const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
  write(root, FILE, text.replaceAll('%', OLD));
  commitAll(root);
  const output = silence();
  const code = await run(applyArgs(root));
  return { code, stderr: output.stderr(), root };
}

describe('fix --apply and an HTML character reference in a template', () => {
  it.each([
    ['a template literal before the import', decoy(), NOT_AT_PLACE],
    [
      'a string at the start of the template',
      "<template>'%' <p :x=\"b &amp;&amp; import('%')\" /></template>\n",
      NOT_AT_PLACE,
    ],
    [
      'an interpolation',
      "<template>\n  <p>{{ b &amp;&amp; import('%') }}</p>\n</template>\n",
      NOT_AT_PLACE,
    ],
    [
      'a condition',
      '<template>\n  <p :a="x &lt; 1 ? import(\'%\') : null" />\n</template>\n',
      NOT_AT_PLACE,
    ],
    ['the quotes', '<template>\n  <p :a="import(&quot;%&quot;)" />\n</template>\n', ENTITY_QUOTE],
  ])('changes nothing for %s', async (_name, text, reason) => {
    const { code, stderr, root } = await apply(text);
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain(reason);
    expect(read(root, FILE)).toBe(text.replaceAll('%', OLD));
  });

  it.each([
    ['an interpolation', "<template>\n  <p>{{ a && import('%') }}</p>\n</template>\n"],
    ['a handler', '<template>\n  <p @click="ok && import(\'%\')" />\n</template>\n'],
    ['a string', "<template>\n  <p :x=\"['a&b', import('%')]\" />\n</template>\n"],
  ])('rewrites the import after a plain & in %s', async (_name, text) => {
    const { code, root } = await apply(text);
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, FILE)).toBe(text.replaceAll('%', NEW));
  });

  it('rewrites the import when the reference is in a text node', async () => {
    const text =
      '<template>\n  <p>a&nbsp;b</p>\n  <button @click="() => import(\'%\')" />\n</template>\n';
    const { code, root } = await apply(text);
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, FILE)).toBe(text.replaceAll('%', NEW));
  });
});
