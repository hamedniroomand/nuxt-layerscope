import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import { moduleNote } from '#src/commands/init.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/** The note as `init` prints it: the registry path and the root are relative to the cwd. */
function noteFor(root: string, registry = join(root, '.nuxt/layerscope/registry.json')): string {
  const folder = relative(process.cwd(), root);
  const where = folder === '' ? 'run' : `in ${folder}, run`;
  return `layerscope found no data from its Nuxt module (${relative(process.cwd(), registry)}), so it reads symbols from the types that Nuxt generates. Some checks need the module (see the shadowed-component note). To use the module, ${where} \`npx nuxi module add nuxt-layerscope --dev\` (or remove \`enabled: false\` from its \`layerscope\` options), then run \`npx nuxi prepare\`. Then run layerscope again.`;
}
const NOTE_START = 'layerscope found no data from its Nuxt module';

const made: string[] = [];

/** A temp folder with a real path. The `afterEach` below removes it. */
function tempRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-init-note-')));
  made.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** A project with the generated types and no registry. It uses the Nuxt install of the fixture. */
function withoutRegistry(): string {
  const root = tempRoot();
  symlinkSync(join(NUXT4_ROOT, 'node_modules'), join(root, 'node_modules'));
  write(root, 'package.json', '{ "name": "init-note", "private": true }\n');
  write(root, 'nuxt.config.ts', 'export default {};\n');
  write(root, '.nuxt/types/imports.d.ts', 'export {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(root, 'app/pages/index.vue', '<template><div /></template>\n');
  return root;
}

interface Output {
  code: number;
  stdout: string;
  stderr: string;
}

async function init(root: string, ...args: string[]): Promise<Output> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', 'init', root, '--dry-run', ...args]);
  const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
  return { code, stdout: text(out), stderr: text(err) };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of made.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('init when the Nuxt module is not installed', () => {
  it('prints the note to stderr, after the summary, and keeps the exit code', async () => {
    const root = withoutRegistry();
    const { code, stdout, stderr } = await init(root);
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain(noteFor(root));
    expect(stderr).not.toContain('init --prepare');
    expect(stdout).not.toContain(NOTE_START);
    expect(stdout).toContain('Allowed edges');
  });

  it('prints the note once, also with --verbose', async () => {
    const { stderr } = await init(withoutRegistry(), '--verbose');
    expect(stderr.split(NOTE_START)).toHaveLength(2);
  });

  it('prints no note when a registry exists', async () => {
    const { code, stderr } = await init(NUXT4_ROOT);
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).not.toContain(NOTE_START);
  });

  it('prints no note with --source types, because the user chose types', async () => {
    const { code, stderr } = await init(withoutRegistry(), '--source', 'types');
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).not.toContain(NOTE_START);
  });

  it('prints no note with --source types when a registry exists', async () => {
    const { stderr } = await init(NUXT4_ROOT, '--source', 'types');
    expect(stderr).not.toContain(NOTE_START);
  });
});

describe('init with a registry file that exists', () => {
  it('prints no module note when the registry has another schema version', async () => {
    const root = withoutRegistry();
    write(root, '.nuxt/layerscope/registry.json', '{ "version": 999 }\n');
    const { code, stderr } = await init(root);
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain('schema version 999');
    expect(stderr).not.toContain(NOTE_START);
  });
});

describe('the advice of the note after a real write', () => {
  it('does not tell the user to run init again, which would refuse to replace the config', async () => {
    const root = withoutRegistry();
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await run(['node', 'layerscope', 'init', root])).toBe(EXIT_CLEAN);
    expect(out.mock.calls.map(call => String(call[0])).join('')).toContain('Allowed edges');
    const first = err.mock.calls.map(call => String(call[0])).join('');
    expect(first).toContain(NOTE_START);
    expect(first).not.toMatch(/layerscope init/u);
    expect(await run(['node', 'layerscope', 'init', root])).toBe(EXIT_ERROR);
  });
});

/** A result that read the types of a build dir in a temp folder, so no file depends on the cwd. */
function typesIn(root: string): AnalyzeResult {
  return {
    source: 'types',
    rootDir: root,
    sourceFile: join(root, '.nuxt/types'),
  } as AnalyzeResult;
}

describe('the wording of the note', () => {
  it('is the same with --prepare, because an install or an enable needs a new Nuxt run', () => {
    const root = tempRoot();
    expect(moduleNote(typesIn(root), { source: 'auto', prepare: true })).toEqual(
      moduleNote(typesIn(root), { source: 'auto' }),
    );
  });

  it('gives no note when the registry was read', () => {
    expect(moduleNote({ source: 'registry' } as AnalyzeResult, { source: 'auto' })).toEqual([]);
  });

  it('shows the registry path of a custom build directory, relative to the cwd', () => {
    const root = tempRoot();
    const result = { ...typesIn(root), sourceFile: join(root, 'build/nuxt/types') };
    const [note] = moduleNote(result as AnalyzeResult, { source: 'auto' });
    expect(note).toBe(noteFor(root, join(root, 'build/nuxt/layerscope/registry.json')));
  });
});

describe('the commands of the note', () => {
  const COMMANDS = 'run `npx nuxi module add nuxt-layerscope --dev` (or remove';

  it('names no folder when the root is the cwd', () => {
    const [note] = moduleNote(
      {
        source: 'types',
        rootDir: process.cwd(),
        sourceFile: join(process.cwd(), '.nuxt/types'),
      } as AnalyzeResult,
      { source: 'auto' },
    );
    expect(note).toContain(`To use the module, ${COMMANDS}`);
    expect(note).not.toContain('To use the module, in ');
  });

  it('names the folder as text when the root is not the cwd, and puts no path in a command', () => {
    const root = tempRoot();
    const [note] = moduleNote(typesIn(root), { source: 'auto' });
    const folder = relative(process.cwd(), root);
    expect(note).toContain(`To use the module, in ${folder}, run \`npx nuxi module add`);
    expect(note).toContain('then run `npx nuxi prepare`. Then run layerscope again.');
    expect(note).not.toContain('--cwd');
    expect(note).toBe(noteFor(root));
  });

  it('names a root with a space as text, unchanged', () => {
    const root = join(tempRoot(), 'apps/my web');
    const [note] = moduleNote(typesIn(root), { source: 'auto' });
    expect(note).toContain(`in ${relative(process.cwd(), root)}, run \``);
    expect(note).not.toContain('"');
    expect(note).toBe(noteFor(root));
  });
});
