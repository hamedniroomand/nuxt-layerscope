import { mkdirSync, renameSync, rmSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR } from '#src/cli.ts';
import { check, gitProject } from '#test/git-project.ts';

const CONFIG = "export default { layers: { a: { path: 'layers/a' } }%s };\n";

/** The arguments of `check --staged` with nothing staged, in a format. */
function nothingStaged(root: string, format: string): string[] {
  return [root, '--staged', '--format', format];
}

describe('check with nothing to check, and a config or a baseline that it cannot read', () => {
  it.each(['text', 'github', 'json'])(
    'stops for a config with a syntax error in %s',
    async format => {
      const repo = gitProject();
      repo.write('layerscope.config.mjs', 'export default {\n');
      const result = await check(nothingStaged(repo.root, format), repo.root);
      expect(result.code).toBe(EXIT_ERROR);
      expect(result.err).toContain('layerscope.config.mjs');
    },
  );

  it.each(['text', 'json'])('stops for a baseline that is not JSON in %s', async format => {
    const repo = gitProject();
    repo.write('layerscope-baseline.json', 'not json\n');
    const result = await check(nothingStaged(repo.root, format), repo.root);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain('is not valid JSON');
  });

  it('stops for a baseline path that is a dir', async () => {
    const repo = gitProject();
    mkdirSync(join(repo.root, 'layerscope-baseline.json'));
    const result = await check(nothingStaged(repo.root, 'text'), repo.root);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain('is a directory');
  });
});

describe('check with nothing to check, and a project that it cannot read', () => {
  it('gives an empty report with a note in a machine format when the build dir is empty', async () => {
    const repo = gitProject();
    rmSync(join(repo.root, '.nuxt'), { recursive: true });
    mkdirSync(join(repo.root, '.nuxt'));
    const result = await check(nothingStaged(repo.root, 'json'), repo.root);
    expect(result.code).toBe(EXIT_CLEAN);
    expect(result.out).toContain('The project was not read, so the report is empty: ');
  });
});

describe('check with nothing to check, and the build dir of the config', () => {
  it('reads the project from the buildDir of the config', async () => {
    const repo = gitProject();
    renameSync(join(repo.root, '.nuxt'), join(repo.root, 'build'));
    repo.write('layerscope.config.mjs', CONFIG.replace('%s', ", buildDir: 'build'"));
    const result = await check(nothingStaged(repo.root, 'json'), repo.root);
    expect(result.code).toBe(EXIT_CLEAN);
    expect(result.out).not.toContain('The project was not read');
  });

  it('gives an empty report when the buildDir of the config is not there', async () => {
    const repo = gitProject();
    repo.write('layerscope.config.mjs', CONFIG.replace('%s', ", buildDir: 'build'"));
    const result = await check(nothingStaged(repo.root, 'json'), repo.root);
    expect(result.code).toBe(EXIT_CLEAN);
    expect(result.out).toContain('The project was not read');
  });
});
