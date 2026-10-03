import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURES = ['nuxt3', 'nuxt4', 'matrix'];

/** The playground is not a fixture, but `playground.test.ts` analyzes it, so it needs a registry. */
const PLAYGROUND = fileURLToPath(new URL('../../../playground', import.meta.url));

function fixturePath(path: string): string {
  return fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url));
}

/** The matrix fixture extends `remote-layer` through a local git repo, as it would from GitHub. */
function createRemoteLayerRepo(): void {
  const repo = fixturePath('matrix/.remote-layer-repo');
  rmSync(repo, { recursive: true, force: true });
  cpSync(fixturePath('remote-layer'), repo, { recursive: true });
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  };
  git('init', '--quiet');
  git('add', '.');
  git(
    '-c',
    'user.name=layerscope',
    '-c',
    'user.email=layerscope@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'remote layer',
  );
}

function prepare(fixture: string, cwd = fixturePath(fixture)): void {
  try {
    execFileSync('npx', ['--no-install', 'nuxi', 'prepare'], { cwd, stdio: 'pipe' });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    const output = `${String(stdout ?? '')}${String(stderr ?? '')}`.trim();
    throw new Error(
      `"nuxi prepare" failed in ${fixture}. Run "vp install" after pulling.\n${output}`,
      { cause: error },
    );
  }
}

export function setup(): void {
  createRemoteLayerRepo();
  for (const fixture of FIXTURES) {
    prepare(fixture);
  }
  prepare('playground', PLAYGROUND);
}
