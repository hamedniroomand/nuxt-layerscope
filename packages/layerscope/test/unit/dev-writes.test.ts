import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { writeOnDevChanges, writeOnPrepareTypes } from '#src/module/dev-writes.ts';
import type { DevWrites } from '#src/module/dev-writes.ts';
import type { Nuxt } from '#src/module/nuxt.ts';
import { RegistryWriter } from '#src/module/writer.ts';

const kit = vi.hoisted(() => ({ error: vi.fn<(text: string) => void>() }));

vi.mock('@nuxt/kit', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLogger: (): { error: typeof kit.error } => ({ error: kit.error }),
}));

type Handler = (...args: never[]) => unknown;

const UTIL = '/p/server/utils/a.ts';

/** A fake Nuxt that fires hooks by name, and the steps that the writes took, in order. */
async function noWrite(): Promise<void> {
  await Promise.resolve();
}

function setup(request: DevWrites['request'] = noWrite): {
  call: (name: string, ...args: unknown[]) => Promise<void>;
  steps: string[];
} {
  const hooks = new Map<string, Handler[]>();
  const add = (name: string, handler: Handler): void => {
    hooks.set(name, [...(hooks.get(name) ?? []), handler]);
  };
  const nuxt = {
    options: { srcDir: '/p' },
    hook: add,
    hooks: { hookOnce: add },
  } as unknown as Nuxt;
  const steps: string[] = [];
  writeOnDevChanges(nuxt, {
    request: async () => {
      await request();
      steps.push('write');
    },
    isNitroImportFile: file => file === UTIL,
    afterWatchWrite: () => {
      steps.push('tab');
    },
  });
  const call = async (name: string, ...args: unknown[]): Promise<void> => {
    for (const handler of hooks.get(name) ?? []) {
      // eslint-disable-next-line no-await-in-loop -- hookable runs the handlers in order
      await (handler as (...values: unknown[]) => unknown)(...args);
    }
  };
  return { call, steps };
}

beforeEach(() => {
  kit.error.mockReset();
});

describe('writeOnDevChanges', () => {
  it('writes after app:templatesGenerated', async () => {
    const { call, steps } = setup();
    await call('app:templatesGenerated');
    expect(steps).toEqual(['write']);
  });

  it('does nothing on watcher events after Nuxt closes', async () => {
    const { call, steps } = setup();
    await call('build:done');
    await call('close');
    await call('builder:watch', 'add', UTIL);
    expect(steps).toEqual([]);
  });

  it('does not handle watcher events before build:done', async () => {
    const { call, steps } = setup();
    await call('builder:watch', 'add', UTIL);
    expect(steps).toEqual([]);
  });

  it.each(['add', 'unlink', 'addDir', 'unlinkDir'])(
    'writes on %s for any path, then marks the tab as old',
    async event => {
      const { call, steps } = setup();
      await call('build:done');
      await call('builder:watch', event, '/p/app/pages/index.vue');
      expect(steps).toEqual(['write', 'tab']);
    },
  );
});

describe('writeOnDevChanges on a change', () => {
  it.each([
    ['an absolute path (Nuxt 4)', UTIL],
    ['a path relative to srcDir (Nuxt 3)', 'server/utils/a.ts'],
  ])('writes on a change of a Nitro import file, given as %s', async (_name, path) => {
    const { call, steps } = setup();
    await call('build:done');
    await call('builder:watch', 'change', path);
    expect(steps).toEqual(['write', 'tab']);
  });

  it('does not write on a change of another file', async () => {
    const { call, steps } = setup();
    await call('build:done');
    await call('builder:watch', 'change', '/p/app/components/Card.vue');
    expect(steps).toEqual([]);
  });
});

describe('writeOnDevChanges with a failed write', () => {
  it('logs it and does not throw', async () => {
    const { call, steps } = setup(async () => {
      await Promise.reject(new Error('disk full'));
    });
    await call('build:done');
    await expect(call('builder:watch', 'add', UTIL)).resolves.toBeUndefined();
    await expect(call('app:templatesGenerated')).resolves.toBeUndefined();
    expect(kit.error).toHaveBeenCalledTimes(2);
    expect(kit.error).toHaveBeenCalledWith(
      'nuxt-layerscope could not write the registry: disk full',
    );
    expect(steps).toEqual(['tab']);
  });
});

describe('writeOnDevChanges with the registry writer', () => {
  it('reads the registry once on a change, and does not write the same content again', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'layerscope-dev-writes-')), 'registry.json');
    let renders = 0;
    const writer = new RegistryWriter(file, async () => {
      renders += 1;
      await Promise.resolve();
      return '{}\n';
    });
    const { call } = setup(async () => {
      await writer.request();
    });
    await call('app:templatesGenerated');
    const written = statSync(file).mtimeMs;
    // A second write would get a later mtime.
    await new Promise(resolve => {
      setTimeout(resolve, 20);
    });
    await call('build:done');
    await call('builder:watch', 'change', UTIL);
    expect(renders).toBe(2);
    expect(statSync(file).mtimeMs).toBe(written);
    expect(readFileSync(file, 'utf8')).toBe('{}\n');
  });
});

describe('writeOnPrepareTypes', () => {
  /** Fires `prepare:types` on a fake Nuxt with a write that fails. */
  async function prepareTypes(dev: boolean): Promise<void> {
    let handler: (() => Promise<void>) | undefined;
    const nuxt = {
      options: { dev },
      hook: (_name: string, add: () => Promise<void>): void => {
        handler = add;
      },
    } as unknown as Nuxt;
    writeOnPrepareTypes(nuxt, async () => {
      await Promise.reject(new Error('file went away'));
    });
    await handler?.();
  }

  it('logs a failed write under nuxi dev and does not throw', async () => {
    await expect(prepareTypes(true)).resolves.toBeUndefined();
    expect(kit.error).toHaveBeenCalledWith(
      'nuxt-layerscope could not write the registry: file went away',
    );
  });

  it('throws a failed write under nuxi prepare and nuxi build', async () => {
    await expect(prepareTypes(false)).rejects.toThrow('file went away');
    expect(kit.error).not.toHaveBeenCalled();
  });
});
