import { existsSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, run } from '#src/cli.ts';

import { repoProject, silence } from './fix-apply-project.ts';
import { CART } from './fix-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Each order of the flags and the root. */
const ORDERS: [string, (root: string) => string[]][] = [
  ['root, --dry-run', root => [root, '--dry-run']],
  ['--dry-run, root', root => ['--dry-run', root]],
  ['--apply, --allow-dirty, root', root => ['--apply', '--allow-dirty', root]],
  ['root, --allow-dirty, --apply', root => [root, '--allow-dirty', '--apply']],
  ['--allow-dirty, root, --apply', root => ['--allow-dirty', root, '--apply']],
];

describe('the order of the flags of fix and the root', () => {
  it.each(ORDERS)('uses the root: %s', async (_name, args) => {
    const root = repoProject();
    const output = silence();
    expect(await run(['node', 'layerscope', 'fix', ...args(root)])).toBe(EXIT_CLEAN);
    const applied = args(root).includes('--apply');
    expect(existsSync(join(root, CART))).toBe(!applied);
    expect(output.stdout()).toContain('useCart.ts');
  });
});
