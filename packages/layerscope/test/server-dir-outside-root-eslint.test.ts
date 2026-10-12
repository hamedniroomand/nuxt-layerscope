import { readFileSync, writeFileSync } from 'node:fs';

import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { join, relative } from 'pathe';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import plugin from '#src/eslint/index.ts';
import { lintFile } from '#src/eslint/lint-file.ts';
import { loadProject } from '#src/eslint/load-project.ts';

import type { OutsideServerProject } from './outside-server-project.ts';
import { createOutsideServerProject, writeOutsideRegistry } from './outside-server-project.ts';

let project: OutsideServerProject;

beforeAll(async () => {
  project = createOutsideServerProject();
  await writeOutsideRegistry(project, []);
});

describe('a serverDir outside the project root: the ESLint plugin', () => {
  async function messages(rule: Linter.RuleEntry): Promise<string[]> {
    const base = join(project.root, '..');
    const eslint = new ESLint({
      cwd: base,
      overrideConfigFile: true,
      overrideConfig: [
        { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
        { plugins: { layerscope: plugin }, rules: { 'layerscope/layer-boundary': rule } },
      ],
    });
    const [result] = await eslint.lintFiles([relative(base, project.files.violation)]);
    return result.messages.map(message => message.message);
  }

  it('reports the violation when the root option names the project', async () => {
    const found = await messages(['error', { root: project.root }]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('shop');
  });

  it('says that it found no registry above the file when the root option is not set', async () => {
    const found = await messages('error');
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('registry.json above this file');
  });
});

describe('a registry that has no source dirs of the layers', () => {
  it('loads, and the owner of a file falls back to the root of the layer', () => {
    const file = join(project.root, '.nuxt/layerscope/registry.json');
    const registry = JSON.parse(readFileSync(file, 'utf8')) as {
      layers: Record<string, unknown>[];
    };
    for (const layer of registry.layers) {
      delete layer.serverDir;
      layer.sharedDir = 5;
    }
    writeFileSync(file, JSON.stringify(registry));
    const load = loadProject(project.root);
    expect(load.ok).toBe(true);
    if (load.ok) {
      expect(load.project.env.ownerOf(join(project.root, 'app/a.ts'))?.name).toBe('root');
      expect(load.project.env.ownerOf(project.files.violation)).toBeNull();
      expect(lintFile(project.files.violation, 'export {};\n', load.project).boundary).toEqual([]);
    }
  });
});
