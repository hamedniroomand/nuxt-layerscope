import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { EXIT_ERROR, run } from '#src/cli.ts';
import { loadConfig } from '#src/config/load.ts';
import { projectFor } from '#src/eslint/project.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const CANNOT_DENY = process.platform === 'win32' || process.getuid?.() === 0;

afterEach(() => {
  vi.restoreAllMocks();
});

async function cli(...args: string[]): Promise<{ code: number; stderr: string }> {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', ...args]);
  const stderr = err.mock.calls.map(call => String(call[0])).join('');
  vi.restoreAllMocks();
  return { code, stderr };
}

const tempDir = (): string => realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-config-')));

const NEEDS_NAME =
  'layerscope: --config needs a file name. Leave it out to use the layerscope.config.* file in the root.';
const NUMBER_HINT = ' For a file name that is a number, write it as ./<name>.';

describe('the value of --config', () => {
  it.each([
    ['an empty value', [''], ''],
    ['no value', [], ''],
    ['a number', ['5'], NUMBER_HINT],
    ['a number with a leading zero', ['007'], NUMBER_HINT],
  ])('stops with exit 2 for %s', async (_name, value, hint) => {
    const { code, stderr } = await cli('check', NUXT4_ROOT, '--config', ...value);
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toBe(`${NEEDS_NAME}${hint}\n`);
  });

  it('stops with exit 2 when it is given two times', async () => {
    const { code, stderr } = await cli('check', NUXT4_ROOT, '--config', 'a.ts', '--config', 'b.ts');
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toBe('layerscope: --config was given more than once. Give it one time.\n');
  });

  it('stops init too, before it writes a file', async () => {
    const root = tempDir();
    const { code, stderr } = await cli('init', root, '--config', '');
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toBe(`${NEEDS_NAME}\n`);
    expect(existsSync(join(root, 'layerscope.config.ts'))).toBe(false);
  });
});

/** A root with `locked/layerscope.config.ts`, and `locked` with no permission. */
function withLocked(check: (root: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const root = tempDir();
    mkdirSync(join(root, 'locked'));
    writeFileSync(join(root, 'locked/layerscope.config.ts'), 'export default {};\n');
    chmodSync(join(root, 'locked'), 0o000);
    try {
      await check(root);
    } finally {
      chmodSync(join(root, 'locked'), 0o700);
    }
  };
}

describe.skipIf(CANNOT_DENY)('a config file in a folder that cannot be read', () => {
  it(
    'says that it cannot read the file named by --config, not that it is not found',
    withLocked(async root => {
      const { code, stderr } = await cli('check', root, '--config', 'locked/layerscope.config.ts');
      expect(code).toBe(EXIT_ERROR);
      expect(stderr).toContain(
        `Cannot read ${join(root, 'locked/layerscope.config.ts')} (EACCES). Check the permissions of the file and of its folders.`,
      );
      expect(stderr).not.toContain('Config file not found');
    }),
  );

  it(
    'stops init too, also with --dry-run, and does not act as if there is no config',
    withLocked(async root => {
      const { code, stderr } = await cli(
        'init',
        root,
        '--config',
        'locked/layerscope.config.ts',
        '--dry-run',
      );
      expect(code).toBe(EXIT_ERROR);
      expect(stderr).toContain(
        `Cannot read ${join(root, 'locked/layerscope.config.ts')} (EACCES).`,
      );
    }),
  );

  it(
    'stops, and does not go on with no config, when it cannot look for the default names',
    withLocked(async root => {
      await expect(loadConfig(join(root, 'locked'))).rejects.toThrow(
        `Cannot read ${join(root, 'locked/layerscope.config.ts')} (EACCES).`,
      );
    }),
  );
});

/** Layer `admin` may use no layer and uses `shop`, and the baseline in the root accepts that. */
async function baselinedProject(): Promise<string> {
  const root = tempDir();
  const files: [string, string][] = [
    ['.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n'],
    ['.nuxt/components.d.ts', '\n'],
    [
      'layerscope.config.mjs',
      "export default { layers: { admin: { path: 'layers/admin', allow: [] }, shop: { path: 'layers/shop' } } };\n",
    ],
    ['layers/shop/app/value.ts', 'export const value = 1;\n'],
    [
      'layers/admin/app/use.ts',
      "import { value } from '../../shop/app/value';\nexport const x = value;\n",
    ],
  ];
  for (const [path, content] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const { findings } = await analyze({ rootDir: root });
  expect(findings).not.toHaveLength(0);
  writeBaseline(join(root, 'layerscope-baseline.json'), createBaseline(findings, root));
  return root;
}

describe('the baseline option of analyze', () => {
  it('applies no baseline with false, and the baseline file of the root with true', async () => {
    const root = await baselinedProject();
    const without = await analyze({ rootDir: root, baseline: false });
    expect(without.baseline).toBeUndefined();
    expect(without.findings).not.toHaveLength(0);
    const withFile = await analyze({ rootDir: root, baseline: true });
    expect(withFile.findings).toHaveLength(0);
  });

  it('stops for a value that is not a file name, true or false', async () => {
    await expect(analyze({ rootDir: NUXT4_ROOT, baseline: 5 as never })).rejects.toThrow(
      'baseline must be a non-empty file name.',
    );
  });
});

describe('the ESLint rule and a config file that cannot be read', () => {
  it('gives one lint message, and does not throw', () => {
    const root = tempDir();
    mkdirSync(join(root, '.nuxt/layerscope'), { recursive: true });
    writeFileSync(join(root, '.nuxt/layerscope/registry.json'), '{}');
    // A link to itself: stat fails with ELOOP.
    symlinkSync(join(root, 'layerscope.config.ts'), join(root, 'layerscope.config.ts'));
    const load = projectFor(join(root, 'app/a.ts'), root);
    expect(load).toEqual({
      ok: false,
      message: `Cannot read ${join(root, 'layerscope.config.ts')} (ELOOP). Check the permissions of the file and of its folders.`,
    });
  });
});
