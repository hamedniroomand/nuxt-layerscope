import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { RegistryCollector } from '#src/module/collect.ts';
import { ImportDirRecorder, loadUnimport, unimportWarning } from '#src/module/import-dirs.ts';
import type { Nuxt } from '#src/module/nuxt.ts';

const kit = vi.hoisted(() => ({
  resolveModule: vi.fn<(id: string) => string>(),
  warn: vi.fn<(text: string) => void>(),
}));

vi.mock('@nuxt/kit', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveModule: kit.resolveModule,
  useLogger: (): { warn: typeof kit.warn } => ({ warn: kit.warn }),
}));

function failWith(code: string, message = 'cannot resolve'): void {
  kit.resolveModule.mockImplementation(() => {
    throw Object.assign(new Error(message), { code });
  });
}

/** A module path that loads but has no `normalizeScanDirs`: this test file itself. */
function resolveToThisFile(): void {
  kit.resolveModule.mockImplementation(id =>
    id === 'nuxt' ? '/p/nuxt.mjs' : new URL(import.meta.url).pathname,
  );
}

function fakeNuxt(): Nuxt {
  return {
    _version: '0.0.0',
    options: {
      _layers: [],
      alias: {},
      ignore: [],
      extensions: ['.vue'],
      buildDir: '/p/.nuxt',
      rootDir: '/p',
    },
    hook: vi.fn(),
  } as unknown as Nuxt;
}

beforeEach(() => {
  kit.resolveModule.mockReset();
  kit.warn.mockReset();
});

describe('loadUnimport', () => {
  it.each(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'])('fails with a cause on %s', async code => {
    failWith(code);
    expect(await loadUnimport('/p')).toEqual({ kind: 'failed', cause: 'unimport was not found' });
  });

  it('fails with the message of any other error, and does not throw', async () => {
    failWith('EACCES', 'permission denied');
    expect(await loadUnimport('/p')).toEqual({ kind: 'failed', cause: 'permission denied' });
  });

  it('fails when the package has no normalizeScanDirs (an older unimport)', async () => {
    resolveToThisFile();
    const loaded = await loadUnimport('/p');
    expect(loaded.kind).toBe('failed');
    expect(loaded.kind === 'failed' && loaded.cause).toMatch(/has no normalizeScanDirs/u);
  });
});

describe.each([
  [
    'it is not found',
    (): void => {
      failWith('ERR_MODULE_NOT_FOUND');
    },
    'unimport was not found',
  ],
  ['it has no normalizeScanDirs', resolveToThisFile, 'has no normalizeScanDirs'],
  [
    'another error stops the lookup',
    (): void => {
      failWith('EIO', 'disk error');
    },
    'disk error',
  ],
])('the recorder when %s', (_name, arrange, cause) => {
  beforeEach(arrange);

  it('records null, warns once with the cause, and does not throw', async () => {
    const recorder = new ImportDirRecorder();
    expect(await recorder.recordApp('/p')).toBeNull();
    expect(await recorder.recordNitro('/p', null)).toBeNull();
    expect(kit.warn).toHaveBeenCalledTimes(1);
    expect(kit.warn.mock.calls[0]?.[0]).toContain(cause);
    expect(kit.warn.mock.calls[0]?.[0]).toMatch(
      /^nuxt-layerscope could not read the auto-import dirs of Nuxt \(/u,
    );
  });

  it('gives importDirs: null in the registry', async () => {
    const registry = await new RegistryCollector(fakeNuxt(), {}).collect();
    expect(registry.importDirs).toBeNull();
    expect(kit.warn).toHaveBeenCalledWith(expect.stringContaining(cause));
  });
});

describe('unimportWarning', () => {
  it('has the cause and no version of unimport', () => {
    expect(unimportWarning('why')).toBe(
      'nuxt-layerscope could not read the auto-import dirs of Nuxt (why), so the stale check does not find new auto-import files.',
    );
  });
});
