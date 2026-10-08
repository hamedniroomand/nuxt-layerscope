import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vite-plus/test';

import { prepareNuxt } from '#src/analyze/prepare.ts';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }));

describe('prepareNuxt', () => {
  it('turns off Node warnings in the nuxi prepare child', () => {
    prepareNuxt('/project');
    const options = vi.mocked(spawnSync).mock.calls[0]?.[2];
    expect(options?.env?.NODE_NO_WARNINGS).toBe('1');
  });
});
