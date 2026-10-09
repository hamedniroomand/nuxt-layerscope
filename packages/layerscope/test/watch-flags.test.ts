import { existsSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';

import { project } from './watch-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('check --watch with --update-baseline', () => {
  it('exits with 2 and writes no baseline', async () => {
    const root = project();
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const code = await run(['node', 'layerscope', 'check', root, '--watch', '--update-baseline']);
    expect(code).toBe(2);
    expect(existsSync(join(root, 'layerscope-baseline.json'))).toBe(false);
  });
});
