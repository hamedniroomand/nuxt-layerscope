import { writeFileSync } from 'node:fs';

import { Linter } from 'eslint';
import { join } from 'pathe';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vite-plus/test';

import plugin from '#src/eslint/index.ts';

import { createProject } from './eslint-project.ts';

const config: Linter.Config[] = [
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  plugin.configs.recommended,
];

function lint(dir: string, file: string, text: string): string[] {
  return new Linter({ configType: 'flat', cwd: dir })
    .verify(text, config, file)
    .map(message => `${message.ruleId} ${message.message}`);
}

function withConfig(layers: string): { dir: string; consumer: string } {
  const { dir, consumer } = createProject();
  writeFileSync(join(dir, 'layerscope.config.mjs'), `export default { layers: ${layers} };\n`);
  return { dir, consumer };
}

describe('eslint plugin layer-internal rule', () => {
  it('reports a symbol that its layer does not expose', () => {
    const { dir, consumer } = withConfig(
      "{ web: { allow: ['shop'] }, shop: { expose: ['useOther'] } }",
    );
    expect(lint(dir, consumer, 'export const total = useCart();')).toEqual([
      expect.stringMatching(
        /^layerscope\/layer-internal Auto-import "useCart" is internal to layer "shop": useCart → layers\/shop\/composables\/useCart\.ts \(exposed by "shop": useOther\)$/u,
      ),
    ]);
  });

  it('is quiet for an exposed symbol and for a layer without expose', () => {
    const exposed = withConfig("{ web: { allow: ['shop'] }, shop: { expose: ['useCart'] } }");
    expect(lint(exposed.dir, exposed.consumer, 'export const total = useCart();')).toEqual([]);
    const open = withConfig("{ web: { allow: ['shop'] }, shop: {} }");
    expect(lint(open.dir, open.consumer, 'export const total = useCart();')).toEqual([]);
  });

  it('names a scoped entry in the layer-boundary message', () => {
    const { dir, consumer } = withConfig(
      "{ web: { allow: [{ layer: 'shop', only: ['useOther'] }] }, shop: {} }",
    );
    expect(lint(dir, consumer, 'export const total = useCart();')).toEqual([
      expect.stringContaining('(allowed for "web": shop (only useOther))'),
    ]);
  });
});
