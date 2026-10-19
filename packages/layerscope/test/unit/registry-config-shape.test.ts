import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { recordedOptions } from '#src/config/effective.ts';
import { projectFor } from '#src/eslint/project.ts';
import { readRegistry } from '#src/registry/read.ts';
import { REGISTRY_FILE, REGISTRY_VERSION } from '#src/registry/schema.ts';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const MESSAGE = (file: string): string =>
  `${file}: the nuxt.config options (layerscope) that it recorded are not an object. Run "nuxi prepare" to write them again.`;

/** A project root with a registry in `.nuxt` that holds `config`. */
function rootWith(config: unknown): { root: string; file: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-reg-')));
  created.push(root);
  const file = join(root, '.nuxt', REGISTRY_FILE);
  mkdirSync(join(root, '.nuxt/layerscope'), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: REGISTRY_VERSION, layers: [], config }));
  return { root, file };
}

describe('the options that a registry recorded', () => {
  it.each([null, 'x', [], 1])('stop the run when they are %j', value => {
    expect(() => recordedOptions(value, '/b/registry.json')).toThrow(MESSAGE('/b/registry.json'));
  });

  it('keep only the project keys', () => {
    const value = { rules: { 'layer-boundary': 'off' }, baseline: 'other.json', buildDir: 'x' };
    expect(recordedOptions(value, 'f')).toEqual({ rules: { 'layer-boundary': 'off' } });
  });

  it('are not there when the registry has none', () => {
    expect(recordedOptions(undefined, 'f')).toBeUndefined();
  });

  it('stop readRegistry with the path of the file', () => {
    const { root, file } = rootWith(null);
    expect(() => readRegistry(join(root, '.nuxt'))).toThrow(MESSAGE(file));
  });

  it('give one lint message in the ESLint plugin, not a crash', () => {
    const { root, file } = rootWith(null);
    expect(projectFor(join(root, 'a.ts'), root)).toEqual({ ok: false, message: MESSAGE(file) });
  });
});
