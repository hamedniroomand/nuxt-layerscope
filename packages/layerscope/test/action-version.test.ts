import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { join, resolve } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { tempDir } from '#test/watch-project.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const packageVersion = (root: string): string =>
  (
    JSON.parse(readFileSync(join(root, 'packages/layerscope/package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
// Reads `inputs.version.default` line by line. It does not share code with the sync script.
const actionDefault = (root: string): string | undefined => {
  const lines = readFileSync(join(root, 'action.yml'), 'utf8').split(/\r?\n/u);
  const start = lines.indexOf('  version:');
  const line = lines.slice(start + 1).find(text => text.startsWith('    default:'));
  return line?.slice('    default:'.length).split('#')[0]?.trim();
};

// A copy of the files that the script reads, so the test does not change the repository.
const copy = (version: string): string => {
  const root = tempDir();
  mkdirSync(join(root, 'packages/layerscope'), { recursive: true });
  cpSync(join(ROOT, 'action.yml'), join(root, 'action.yml'));
  execFileSync('node', [
    '-e',
    `require('node:fs').writeFileSync(process.argv[1], JSON.stringify({version: process.argv[2]}))`,
    join(root, 'packages/layerscope/package.json'),
    version,
  ]);
  return root;
};
const sync = (root: string): string =>
  execFileSync('node', [join(ROOT, 'scripts/sync-action-version.mjs'), root], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

describe('the version input of the action', () => {
  it('has the version of the package as its default', () => {
    expect(actionDefault(ROOT)).toBe(packageVersion(ROOT));
  });

  it('is changed by the sync script, and only that line', () => {
    const root = copy('9.8.7-beta.1');
    const before = readFileSync(join(root, 'action.yml'), 'utf8');
    expect(sync(root)).toBe('The action now runs nuxt-layerscope 9.8.7-beta.1.\n');
    const after = readFileSync(join(root, 'action.yml'), 'utf8');
    expect(actionDefault(root)).toBe('9.8.7-beta.1');
    expect(after.replace('9.8.7-beta.1', String(actionDefault(ROOT)))).toBe(before);
  });

  it('is left alone by the sync script when it is right', () => {
    const root = copy(packageVersion(ROOT));
    expect(sync(root)).toBe(`The action already runs nuxt-layerscope ${packageVersion(ROOT)}.\n`);
  });
});

describe('the sync script, odd files', () => {
  it('keeps a trailing comment and CRLF line ends', () => {
    const root = copy('1.2.3');
    const file = join(root, 'action.yml');
    const text = readFileSync(file, 'utf8')
      .replace(/default: \S+\n(?=\n+outputs:)/u, 'default: 0.1.0 # the release\n')
      .replaceAll('\n', '\r\n');
    writeFileSync(file, text);
    expect(sync(root)).toBe('The action now runs nuxt-layerscope 1.2.3.\n');
    const after = readFileSync(file, 'utf8');
    expect(after).toContain('default: 1.2.3 # the release\r\n');
    expect(after.split('\n').every(line => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('fails with a true message when the default line is missing', () => {
    const root = copy('1.2.3');
    writeFileSync(join(root, 'action.yml'), 'name: x\n');
    expect(() => sync(root)).toThrow(
      'Could not find the default line of the version input in action.yml.',
    );
  });
});
