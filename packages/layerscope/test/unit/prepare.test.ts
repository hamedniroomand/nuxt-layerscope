import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { prepareNuxt } from '#src/analyze/prepare.ts';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));

function setPlatform(platform: NodeJS.Platform): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
}

describe('prepareNuxt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(spawnSync).mockClear();
  });

  it('turns off Node warnings in the nuxi prepare child', () => {
    setPlatform('linux');
    prepareNuxt('/project');
    const options = vi.mocked(spawnSync).mock.calls[0]?.[2];
    expect(options?.env?.NODE_NO_WARNINGS).toBe('1');
  });

  it('starts npx with an args array and no shell outside Windows', () => {
    setPlatform('linux');
    prepareNuxt('/project');
    const [command, args, options] = vi.mocked(spawnSync).mock.calls[0] ?? [];
    expect(command).toBe('npx');
    expect(args).toEqual(['--no-install', 'nuxi', 'prepare']);
    expect(options).not.toHaveProperty('shell');
  });

  it('starts npx as one command string with a shell on Windows', () => {
    setPlatform('win32');
    prepareNuxt('C:\\project');
    const [command, options] = vi.mocked(spawnSync).mock.calls[0] ?? [];
    expect(command).toBe('npx --no-install nuxi prepare');
    expect(options).toMatchObject({ shell: true, cwd: 'C:\\project' });
  });

  it('shows the reason when npx cannot start', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      error: new Error('spawn npx ENOENT'),
      status: null,
    } as never);
    expect(() => {
      prepareNuxt('/project');
    }).toThrow('Could not start "npx" in /project: spawn npx ENOENT');
  });

  it('keeps the failure text when nuxi prepare exits with an error', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 } as never);
    expect(() => {
      prepareNuxt('/project');
    }).toThrow('"nuxi prepare" failed in /project');
  });
});
