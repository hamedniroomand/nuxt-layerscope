import { renameSync } from 'node:fs';

import { dirname, join } from 'pathe';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';

import { writeProject } from './unused-extra-project.ts';

/** A project in the dir `-odd dir`; the tests run in its parent dir. */
let parent = '';

beforeAll(() => {
  const app = writeProject(
    {
      'layers/web/app/utils/oddUtil.ts': 'export const oddUtil = () => 1;\n',
      'layers/web/app/utils/usedUtil.ts': 'export const usedUtil = () => 1;\n',
      'layers/web/app/pages/index.vue':
        '<script setup lang="ts">\nusedUtil();\n</script>\n<template><div /></template>\n',
    },
    {
      oddUtil: 'layers/web/app/utils/oddUtil.ts',
      usedUtil: 'layers/web/app/utils/usedUtil.ts',
    },
    undefined,
    {},
    true,
  );
  parent = dirname(app);
  renameSync(app, join(parent, '-odd dir'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function runIn(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  vi.spyOn(process, 'cwd').mockReturnValue(parent);
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', ...args]);
  const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
  return { code, out: text(out), err: text(err) };
}

describe('arguments after --', () => {
  it('uses the first one as the root of unused, also when it starts with -', async () => {
    const { code, out } = await runIn('unused', '--', '-odd dir');
    expect(code).toBe(EXIT_CLEAN);
    expect(out).toContain('oddUtil');
    expect(out).not.toContain('usedUtil');
  });

  it('fills the next positional argument of the command', async () => {
    const why = await runIn('why', 'usedUtil', '--', '-odd dir');
    expect(why.code).toBe(EXIT_CLEAN);
    expect(why.out).toContain('usedUtil');
    const check = await runIn('check', '--', '-odd dir');
    expect(check.code).toBe(EXIT_CLEAN);
  });

  it('stops with an error for an argument that the command does not take', async () => {
    const { code, err } = await runIn('unused', '--', '-odd dir', '--prepare');
    expect(code).toBe(EXIT_ERROR);
    expect(err).toContain('Unused args: `--prepare`');
  });
});
