import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, run } from '#src/cli.ts';
import { moduleNote } from '#src/commands/init.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/** The start of the note, with the registry path as `init` shows it: relative to the cwd. */
function noteFor(root: string): string {
  const registry = relative(process.cwd(), join(root, '.nuxt/layerscope/registry.json'));
  return `layerscope found no data from its Nuxt module (${registry}), so it reads symbols from the types that Nuxt generates, which is less exact.`;
}
const NOTE_START = 'layerscope found no data from its Nuxt module';
const INSTALL = 'npx nuxi module add nuxt-layerscope --dev';
const RERUN = 'layerscope init --prepare';

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** A project with the generated types and no registry. It uses the Nuxt install of the fixture. */
function withoutRegistry(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-init-note-')));
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
});

describe('init when the Nuxt module is not installed', () => {
  it('prints the note to stderr, after the summary, and keeps the exit code', async () => {
    const root = withoutRegistry();
    const { code, stdout, stderr } = await init(root);
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain(noteFor(root));
    expect(stderr).toContain(INSTALL);
    expect(stderr).toContain(RERUN);
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

describe('the wording of the note', () => {
  const types = { source: 'types' } as AnalyzeResult;

  it('gives only the install step with --prepare, because Nuxt just ran', () => {
    const [note] = moduleNote(types, { source: 'auto', prepare: true });
    expect(note).toContain(INSTALL);
    expect(note).not.toContain(RERUN);
  });

  it('gives no note when the registry was read', () => {
    expect(moduleNote({ source: 'registry' } as AnalyzeResult, { source: 'auto' })).toEqual([]);
  });

  it('shows the registry path of a custom build directory, relative to the cwd', () => {
    const sourceFile = join(process.cwd(), 'build/nuxt/types');
    const [note] = moduleNote({ source: 'types', sourceFile } as AnalyzeResult, { source: 'auto' });
    expect(note).toContain('(build/nuxt/layerscope/registry.json)');
  });
});
