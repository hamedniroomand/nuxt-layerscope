import { existsSync, rmSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR } from '#src/cli.ts';

import { init, project, read, removeProjects } from './init-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
  removeProjects();
});

const CONFIG = 'config/layerscope.config.ts';

describe('the folder of the config file that init writes', () => {
  it('is made when it does not exist', async () => {
    const root = project();
    expect((await init(root, '--config', CONFIG)).code).toBe(EXIT_CLEAN);
    expect(read(root, CONFIG)).toContain('defineConfig');
  });

  it('stops with the file name and the error code when a file is in place of the folder', async () => {
    const root = project();
    writeFileSync(join(root, 'config'), '');
    const { code, stderr } = await init(root, '--config', CONFIG);
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain(`layerscope: Cannot write ${join(root, CONFIG)} (E`);
    expect(stderr).toMatch(/ \(E[A-Z]+\)\.\n/u);
  });
});

describe('init --baseline when the baseline cannot be written', () => {
  const OLD = "export default { baseline: 'ci/base.json' };\n";

  it('says that the config is written, and the same command with --force then writes both', async () => {
    const root = project({
      files: [
        ['layerscope.config.mjs', OLD],
        ['ci', ''],
      ],
    });
    const first = await init(root, '--force', '--baseline');
    expect(first.code).toBe(EXIT_ERROR);
    const config = join(root, 'layerscope.config.mjs');
    expect(first.stderr).toContain(`layerscope: Cannot write ${join(root, 'ci/base.json')} (E`);
    expect(first.stderr).toContain(
      `). The config file ${config} is already written. Fix the cause, then run the same command again with --force.\n`,
    );
    const written = read(root, 'layerscope.config.mjs');
    expect(written).toContain('defineConfig');
    expect(written).toContain("baseline: 'ci/base.json'");

    rmSync(join(root, 'ci'));
    expect((await init(root, '--force', '--baseline')).code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.mjs')).toBe(written);
    expect(existsSync(join(root, 'ci/base.json'))).toBe(true);
  });
});
