import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { vi } from 'vite-plus/test';

import { run } from '#src/cli.ts';

import { page, project, tempDir, write } from './watch-project.ts';

const CONFIG = (rules: string): string =>
  `export default { layers: { a: { path: 'layers/a' } }, rules: { ${rules} } };\n`;

export const BAD = page('./missing');
export const GOOD = page('../helper');

export interface GitProject {
  /** The Nuxt project, which is the repository root unless `nested` was asked for. */
  root: string;
  /** The repository root. */
  repo: string;
  git: (...args: string[]) => string;
  write: (path: string, content: string) => void;
  commit: (message: string) => void;
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: 'pipe' },
  );
}

/**
 * A committed project on `main` with two good pages and `unresolved-reference` as an error. With
 * `nested` the project is `apps/web` of the repository, next to `apps/other`.
 */
export function gitProject(options: { nested?: boolean; rules?: string } = {}): GitProject {
  const base = project(2);
  const repo = options.nested === true ? tempDir() : base;
  const root = options.nested === true ? join(repo, 'apps/web') : base;
  if (options.nested === true) {
    mkdirSync(root, { recursive: true });
    execFileSync('cp', ['-R', `${base}/.`, root], { stdio: 'pipe' });
    write(repo, 'apps/other/a.ts', 'export const other = 1;\n');
  }
  writeFileSync(
    join(root, 'layerscope.config.mjs'),
    CONFIG(options.rules ?? "'unresolved-reference': 'error'"),
  );
  write(repo, '.gitignore', '.nuxt\n');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'start');
  return {
    root,
    repo,
    git: (...args) => git(repo, ...args),
    write: (path, content) => {
      write(repo, path, content);
    },
    commit: message => {
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', message);
    },
  };
}

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

/** Runs `layerscope check ...`, with the working directory that `cwd` names. */
export async function check(args: string[], cwd?: string): Promise<CliResult> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const dir = cwd === undefined ? undefined : vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  try {
    const code = await run(['node', 'layerscope', 'check', ...args]);
    return {
      code,
      out: out.mock.calls.map(call => String(call[0])).join(''),
      err: err.mock.calls.map(call => String(call[0])).join(''),
    };
  } finally {
    dir?.mockRestore();
    out.mockRestore();
    err.mockRestore();
  }
}

export interface JsonReport {
  findings: { file: string; symbol: string; rule: string }[];
  notes: string[];
  baseline?: { suppressed: unknown[]; removable: { file: string; symbol: string }[] };
}

export function reportOf(result: CliResult): JsonReport {
  return JSON.parse(result.out) as JsonReport;
}

export const files = (report: JsonReport): string[] => report.findings.map(finding => finding.file);
