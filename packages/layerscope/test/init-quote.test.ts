import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vite-plus/test';

import { quote, renderConfig } from '#src/init/render.ts';

describe('the string literals of the generated config', () => {
  it.each(["a'b", 'a\\b', 'a\nb', 'a\rb', 'a\u2028b', 'a\u2029b', "a\r\n'\\b"])(
    'writes %j as a literal that reads back as the same text',
    text => {
      const literal = quote(text);
      expect(literal).not.toMatch(/[\n\r\u2028\u2029]/u);
      const value: unknown = runInNewContext(literal);
      expect(value).toBe(text);
    },
  );

  it('writes the example of an edge on one line, so the config still parses', () => {
    const edge = { from: 'shop', to: 'root', count: 1, example: 'a\nb\r.vue\u2028:3\u2029' };
    const source = renderConfig(['root', 'shop'], [edge]);
    const comment = source.split('\n').find(line => line.includes('1 reference'));
    expect(comment).toContain('e.g. a b .vue :3');
    const config = source
      .replace("import { defineConfig } from 'nuxt-layerscope';", '')
      .replace('export default defineConfig(', '(');
    const value = runInNewContext(config) as { layers: Record<string, { allow: string[] }> };
    expect(value.layers.shop.allow).toEqual(['root']);
  });

  it('writes a buildDir with a line break on one line', () => {
    expect(renderConfig(['root'], [], 'a\nb')).toContain("  buildDir: 'a\\nb',");
  });
});
