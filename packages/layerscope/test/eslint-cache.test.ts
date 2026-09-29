import { writeFileSync } from 'node:fs';

import { ESLint } from 'eslint';
import { join } from 'pathe';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vite-plus/test';

import plugin from '#src/eslint/index.ts';
import { lintFile } from '#src/eslint/lint-file.ts';
import { loadProject } from '#src/eslint/load-project.ts';
import { createRecommended } from '#src/eslint/recommended.ts';

import { createProject } from './eslint-project.ts';

/** A new ESLint run: the config is built again, as when `eslint.config.js` is loaded. */
async function boundaryErrors(dir: string, consumer: string): Promise<number> {
  const eslint = new ESLint({
    cwd: dir,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
      createRecommended(plugin, dir),
    ],
    cache: true,
    cacheLocation: join(dir, 'eslint-cache'),
  });
  const [result] = await eslint.lintFiles([consumer]);
  return result.messages.filter(message => message.ruleId === 'layerscope/layer-boundary').length;
}

describe('eslint --cache', () => {
  it('drops cached results when the layer config changes', async () => {
    const { dir, consumer } = createProject();
    expect(await boundaryErrors(dir, consumer)).toBe(0);
    writeFileSync(
      join(dir, 'layerscope.config.ts'),
      'export default { layers: { web: { allow: [] } } };',
    );
    expect(await boundaryErrors(dir, consumer)).toBe(1);
    writeFileSync(
      join(dir, 'layerscope.config.ts'),
      "export default { layers: { web: { allow: ['shop'] } } };",
    );
    expect(await boundaryErrors(dir, consumer)).toBe(0);
  });
});

describe('lintFile', () => {
  it('does not reuse a result from before the project was reloaded', () => {
    const { dir, consumer } = createProject();
    const text = 'export const total = useCart();';
    writeFileSync(
      join(dir, 'layerscope.config.ts'),
      'export default { layers: { web: { allow: [] } } };',
    );
    const before = loadProject(dir);
    if (!before.ok) {
      throw new Error(before.message);
    }
    expect(lintFile(consumer, text, before.project).boundary).toHaveLength(1);
    const after = {
      ...before.project,
      config: { ...before.project.config, layers: { web: { allow: ['shop'] } } },
    };
    expect(lintFile(consumer, text, after).boundary).toHaveLength(0);
  });
});
