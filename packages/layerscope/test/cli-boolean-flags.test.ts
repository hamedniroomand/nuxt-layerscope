import { existsSync, readFileSync, rmSync } from 'node:fs';

import { cac } from 'cac';
import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_VIOLATIONS, run } from '#src/cli.ts';
import { acceptDashedBooleans } from '#src/commands/shared.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

import { ADMIN, SHARED, SHOP, WEB, cartProject } from './fix-project.ts';

/**
 * Files that a command writes in the working dir when the flag took the root as its value and
 * the root was lost: `init` wrote a config there, so a failing test must not leave it.
 */
const STRAY = ['layerscope.config.ts', 'layerscope-baseline.json'].map(name =>
  join(process.cwd(), name),
);

afterEach(() => {
  vi.restoreAllMocks();
  const written = STRAY.filter(path => existsSync(path));
  for (const path of written) {
    rmSync(path, { force: true });
  }
  expect(written, 'a command wrote in the working dir').toEqual([]);
});

function silence(): () => string {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  return () => out.mock.calls.map(call => String(call[0])).join('');
}

const project = (): string => cartProject([WEB, SHARED, ADMIN, SHOP]);

describe('a boolean flag with a dash in its name, before or after the root', () => {
  it.each([['before'], ['after']])('fix --dry-run, flag %s the root', async order => {
    const root = project();
    const text = silence();
    const args = order === 'before' ? ['--dry-run', root] : [root, '--dry-run'];
    expect(await run(['node', 'layerscope', 'fix', ...args])).toBe(EXIT_CLEAN);
    expect(text()).toContain('useCart.ts →');
  });

  it.each([['before'], ['after']])('init --dry-run, flag %s the root', async order => {
    const config = readFileSync(join(NUXT4_ROOT, 'layerscope.config.ts'), 'utf8');
    const text = silence();
    const args = order === 'before' ? ['--dry-run', NUXT4_ROOT] : [NUXT4_ROOT, '--dry-run'];
    expect(await run(['node', 'layerscope', 'init', ...args])).toBe(EXIT_CLEAN);
    expect(text()).toContain('layers');
    // The fixture has a config, so a real run would refuse. A dry run leaves it as it is.
    expect(readFileSync(join(NUXT4_ROOT, 'layerscope.config.ts'), 'utf8')).toBe(config);
    expect(existsSync(join(process.cwd(), 'layerscope.config.ts'))).toBe(false);
  });

  it.each([['before'], ['after']])('check --update-baseline, flag %s the root', async order => {
    const root = project();
    silence();
    const args = order === 'before' ? ['--update-baseline', root] : [root, '--update-baseline'];
    expect(await run(['node', 'layerscope', 'check', ...args])).toBe(EXIT_CLEAN);
    expect(existsSync(join(root, 'layerscope-baseline.json'))).toBe(true);
  });

  it('check without the flag finds the violations of the root', async () => {
    silence();
    expect(await run(['node', 'layerscope', 'check', project()])).toBe(EXIT_VIOLATIONS);
  });
});

function demo(): ReturnType<typeof cac> {
  const cli = cac('demo');
  cli
    .command('go [root]', 'go')
    .option('--dry-run', 'a flag')
    .option('--out-dir <dir>', 'a value')
    .option('--no-color', 'a negation')
    .option('-q, --quiet-mode', 'a short and a long name');
  return cli;
}

function parsed(argv: string[]): { options: Record<string, unknown>; args: string[] } {
  const cli = demo();
  acceptDashedBooleans(cli);
  cli.parse(['node', 'demo', ...argv], { run: false });
  return { options: cli.options, args: [...cli.args] };
}

describe('the dashed spelling of a boolean flag', () => {
  it('does not change the help text of the command', () => {
    const help = (setup: (cli: ReturnType<typeof cac>) => unknown): string => {
      const info = vi.spyOn(console, 'info').mockReturnValue();
      const cli = demo();
      setup(cli);
      cli.commands[0].outputHelp();
      const text = info.mock.calls.map(call => String(call[0])).join('\n');
      info.mockRestore();
      return text;
    };
    expect(help(acceptDashedBooleans)).toBe(help(cli => cli));
    expect(help(cli => cli)).toContain('--dry-run');
  });

  it('keeps the root next to a flag with a dash', () => {
    const { options, args } = parsed(['go', '--dry-run', 'proj']);
    expect(options.dryRun).toBe(true);
    expect(args).toEqual(['proj']);
  });

  it('leaves a value option with a dash as it is, and it takes its value', () => {
    const { options, args } = parsed(['go', '--out-dir', 'dist', 'proj']);
    expect(options.outDir).toBe('dist');
    expect(args).toEqual(['proj']);
  });

  it('handles --flag=value, a negation and arguments after --', () => {
    expect(parsed(['go', '--dry-run=false', 'proj']).options.dryRun).toBe(false);
    expect(parsed(['go', '--no-dry-run', 'proj']).options.dryRun).toBe(false);
    expect(parsed(['go', 'proj', '--', '--dry-run']).options['--']).toEqual(['--dry-run']);
    expect(parsed(['go', '--no-color', 'proj']).options.color).toBe(false);
  });

  it('writes a long flag with a short name in the same way', () => {
    expect(parsed(['go', '--quiet-mode', 'proj'])).toMatchObject({ options: { quietMode: true } });
  });
});
