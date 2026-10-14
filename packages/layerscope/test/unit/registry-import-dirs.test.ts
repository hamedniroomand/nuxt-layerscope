import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { loadSymbols } from '#src/analyze/symbols.ts';
import { readRegistry } from '#src/registry/read.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { noNuxtIgnore } from '#test/factories.ts';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function buildDirWith(extra: Record<string, unknown>): string {
  const buildDir = mkdtempSync(join(tmpdir(), 'layerscope-read-'));
  created.push(buildDir);
  mkdirSync(join(buildDir, 'layerscope'));
  const layer = {
    name: 'root',
    root: '/p',
    srcDir: '/p/app',
    modulesDir: '/p/modules',
    publicDir: '/p/public',
  };
  writeFileSync(
    join(buildDir, REGISTRY_FILE),
    JSON.stringify({
      version: 1,
      layers: [layer],
      components: [],
      componentDirs: [],
      nuxtIgnore: noNuxtIgnore(),
      nuxtContent: false,
      imports: { app: [], server: [], shared: [] },
      ...extra,
    }),
  );
  return buildDir;
}

const GOOD = {
  dir: '/p/app/composables',
  globs: ['/p/app/composables'],
  scanner: 'nuxt',
  files: [],
};

describe('readRegistry and the auto-import dirs', () => {
  it('reads a registry with a good importDirs list', () => {
    expect(readRegistry(buildDirWith({ importDirs: [GOOD] })).kind).toBe('ok');
  });

  it('reads a registry with importDirs: null, which the module writes when it cannot read the dirs', () => {
    expect(readRegistry(buildDirWith({ importDirs: null })).kind).toBe('ok');
  });

  it.each([
    ['is a string', { importDirs: 'a' }],
    ['is missing', {}],
    ['is not an array', { importDirs: {} }],
    ['has an entry that is not an object', { importDirs: [null] }],
    ['has an entry with no dir', { importDirs: [{ ...GOOD, dir: undefined }] }],
    ['has an entry with no globs', { importDirs: [{ ...GOOD, globs: [] }] }],
    ['has an entry with globs that are not strings', { importDirs: [{ ...GOOD, globs: [1] }] }],
    ['has an entry with files that is not an array', { importDirs: [{ ...GOOD, files: 'a' }] }],
    ['has a file that is not a string', { importDirs: [{ ...GOOD, files: [1] }] }],
    ['has an entry with no scanner', { importDirs: [{ ...GOOD, scanner: undefined }] }],
    ['has an entry with an unknown scanner', { importDirs: [{ ...GOOD, scanner: 'vite' }] }],
  ])('marks the registry as stale when importDirs %s', (_name, extra) => {
    expect(readRegistry(buildDirWith(extra)).kind).toBe('stale');
  });
});

const DIR = { path: '/p/app/components', pattern: '**/*.vue', ignore: [], files: [] };

describe('readRegistry and the component dirs', () => {
  it.each([
    ['a pattern string', DIR],
    ['a pattern list', { ...DIR, pattern: ['**/*.vue', '**/*.tsx'] }],
  ])('reads a component dir with %s', (_name, entry) => {
    expect(readRegistry(buildDirWith({ importDirs: [], componentDirs: [entry] })).kind).toBe('ok');
  });

  it.each([
    ['is missing', { componentDirs: undefined }],
    ['is not an array', { componentDirs: {} }],
    ['has an entry that is not an object', { componentDirs: [null] }],
    ['has an entry with a path that is not a string', { componentDirs: [{ ...DIR, path: null }] }],
    ['has an entry with no pattern', { componentDirs: [{ ...DIR, pattern: undefined }] }],
    ['has a pattern that is not a string', { componentDirs: [{ ...DIR, pattern: [1] }] }],
    ['has an entry with ignore that is not a list', { componentDirs: [{ ...DIR, ignore: 'a' }] }],
    ['has a file that is not a string', { componentDirs: [{ ...DIR, files: [1] }] }],
  ])('marks the registry as stale when componentDirs %s', (_name, extra) => {
    expect(readRegistry(buildDirWith({ importDirs: [], ...extra })).kind).toBe('stale');
  });
});

const RULES = noNuxtIgnore();

describe('readRegistry and the ignore rules of Nuxt', () => {
  it('reads rules with options', () => {
    const nuxtIgnore = { ...RULES, options: { ignorecase: false } };
    expect(readRegistry(buildDirWith({ importDirs: [], nuxtIgnore })).kind).toBe('ok');
  });

  it.each([
    ['are missing', undefined],
    ['are not an object', 'a'],
    ['have a rootDir that is not a string', { ...RULES, rootDir: 1 }],
    ['have roots that are not strings', { ...RULES, roots: [1] }],
    ['have no patterns', { ...RULES, patterns: undefined }],
    ['have a pattern that is not a string', { ...RULES, patterns: [null] }],
    ['have no options', { ...RULES, options: undefined }],
    ['have options that are a list', { ...RULES, options: [] }],
  ])('marks the registry as stale when the rules %s', (_name, nuxtIgnore) => {
    expect(readRegistry(buildDirWith({ importDirs: [], nuxtIgnore })).kind).toBe('stale');
  });
});

describe('a registry with importDirs: null', () => {
  it.each(['auto', 'registry'] as const)('adds a note in %s mode and does not throw', mode => {
    const buildDir = buildDirWith({ importDirs: null });
    const symbols = loadSymbols(buildDir, mode);
    expect(symbols.source).toBe('registry');
    expect(symbols.notes).toEqual([
      `${join(buildDir, REGISTRY_FILE)} has no list of auto-import dirs, so layerscope does not find new auto-import files. "nuxi prepare" prints the reason.`,
    ]);
  });

  it('adds no note when the dirs are there', () => {
    expect(loadSymbols(buildDirWith({ importDirs: [GOOD] }), 'registry').notes).toEqual([]);
  });
});
