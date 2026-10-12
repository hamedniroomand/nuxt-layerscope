import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { assertNotDirectory, readBaseline } from '#src/baseline/index.ts';
import { EXIT_ERROR, run } from '#src/cli.ts';
import { gitProject } from '#test/git-project.ts';
import { tempDir } from '#test/watch-project.ts';

const FILE = 'layerscope-baseline.json';
const BODY = '{"version":1,"entries":[]}\n';
// A mode of 000 changes nothing on Windows and for root.
const CAN_DENY = process.platform !== 'win32' && process.getuid?.() !== 0;

afterEach(() => {
  vi.restoreAllMocks();
});

/** A baseline file in a folder that nobody may enter. The folder is opened again after the test. */
function locked(): { file: string; folder: string } {
  const folder = join(tempDir(), 'locked');
  mkdirSync(folder);
  writeFileSync(join(folder, FILE), BODY);
  chmodSync(folder, 0o000);
  return { file: join(folder, FILE), folder };
}

/** Runs `check` with a baseline in a locked folder. */
async function runLocked(extra: string[]): Promise<{ code: number; err: string; file: string }> {
  const repo = gitProject();
  const { file, folder } = locked();
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    const code = await run([
      'node',
      'layerscope',
      'check',
      repo.root,
      ...extra,
      '--baseline',
      file,
    ]);
    return { code, err: err.mock.calls.join(''), file };
  } finally {
    chmodSync(folder, 0o700);
  }
}

describe('a baseline file that is not there', () => {
  it('reads a missing file as no baseline', () => {
    expect(readBaseline(join(tempDir(), FILE))).toBeNull();
  });

  it('reads a file below a file as no baseline', () => {
    const root = tempDir();
    writeFileSync(join(root, 'plain'), 'x');
    expect(readBaseline(join(root, 'plain', FILE))).toBeNull();
    expect(() => {
      assertNotDirectory(join(root, 'plain', FILE));
    }).not.toThrow();
  });
});

describe.skipIf(!CAN_DENY)('a baseline file that cannot be read', () => {
  it('stops with the file name and the code, and does not read it as missing', () => {
    const { file, folder } = locked();
    try {
      expect(() => readBaseline(file)).toThrow(
        `Cannot read ${file} (EACCES). Check the permissions of the file and of its folders.`,
      );
    } finally {
      chmodSync(folder, 0o700);
    }
  });

  it('stops when the file itself has no read permission', () => {
    const file = join(tempDir(), FILE);
    writeFileSync(file, BODY);
    chmodSync(file, 0o000);
    expect(() => readBaseline(file)).toThrow(`Cannot read ${file} (EACCES)`);
  });

  it('stops check with exit code 2', async () => {
    const result = await runLocked([]);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain(`layerscope: Cannot read ${result.file} (EACCES)`);
  });

  it('stops --update-baseline before it writes', async () => {
    const result = await runLocked(['--update-baseline']);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain(`layerscope: Cannot read ${result.file} (EACCES)`);
  });
});
