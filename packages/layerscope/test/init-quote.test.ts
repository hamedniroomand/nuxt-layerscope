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

  it('writes a buildDir with a line break on one line', () => {
    expect(renderConfig(['root'], [], 'a\nb')).toContain("  buildDir: 'a\\nb',");
  });
});
