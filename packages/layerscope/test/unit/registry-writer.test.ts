import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { basename, dirname, join } from 'pathe';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { RegistryWriter } from '#src/module/writer.ts';

/** The next `renameFailures` renames fail with `renameCode`. */
const fs = vi.hoisted(() => ({ renameFailures: 0, renameCode: 'EPERM' }));

vi.mock('node:fs/promises', async importOriginal => {
  const real = await importOriginal<typeof fsPromises>();
  return {
    ...real,
    writeFile: vi.fn(real.writeFile),
    rename: vi.fn(async (from: string, to: string) => {
      if (fs.renameFailures > 0) {
        fs.renameFailures -= 1;
        throw Object.assign(new Error('rename failed'), { code: fs.renameCode });
      }
      await real.rename(from, to);
    }),
  };
});

beforeEach(() => {
  fs.renameFailures = 0;
  fs.renameCode = 'EPERM';
  vi.mocked(fsPromises.writeFile).mockClear();
  vi.mocked(fsPromises.rename).mockClear();
});

/** The temp files next to the target: the name has the PID and a count. */
const TEMP = /^registry\.json\.\d+\.\d+\.tmp$/u;

/** A writer that always renders the same content, with a count of the renders. */
function setup(): {
  writer: RegistryWriter;
  file: string;
  renders: () => number;
} {
  const file = join(mkdtempSync(join(tmpdir(), 'layerscope-writer-')), 'layerscope/registry.json');
  let count = 0;
  const writer = new RegistryWriter(file, async () => {
    count += 1;
    await Promise.resolve();
    return 'one';
  });
  return { writer, file, renders: () => count };
}

describe('RegistryWriter', () => {
  it('writes the content, and makes the dir', async () => {
    const { writer, file } = setup();
    await writer.request();
    expect(readFileSync(file, 'utf8')).toBe('one');
  });

  it('joins the requests of one tick into one render', async () => {
    const { writer, renders } = setup();
    await Promise.all([writer.request(), writer.request(), writer.request()]);
    expect(renders()).toBe(1);
  });

  it('does not write the file again when the content is the same', async () => {
    const { writer, file } = setup();
    await writer.request();
    const before = statSync(file).mtimeMs;
    await new Promise(resolve => {
      setTimeout(resolve, 20);
    });
    await writer.request();
    expect(statSync(file).mtimeMs).toBe(before);
  });
});

describe('RegistryWriter with a request during a write', () => {
  it('writes once more after it, with the new content', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'layerscope-writer-')), 'registry.json');
    const contents: string[] = [];
    let started = (): void => undefined;
    const firstStarted = new Promise<void>(resolve => {
      started = resolve;
    });
    let release = (): void => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let content = 'one';
    const writer = new RegistryWriter(file, async () => {
      contents.push(content);
      started();
      await gate;
      return content;
    });
    const first = writer.request();
    await firstStarted;
    content = 'two';
    const second = writer.request();
    const third = writer.request();
    release();
    await Promise.all([first, second, third]);
    expect(contents).toEqual(['one', 'two']);
    expect(readFileSync(file, 'utf8')).toBe('two');
  });

  it('rejects the request when the render fails, and the next request writes again', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'layerscope-writer-')), 'registry.json');
    let fail = true;
    const writer = new RegistryWriter(file, async () => {
      await Promise.resolve();
      if (fail) {
        throw new Error('render failed');
      }
      return 'ok';
    });
    await expect(writer.request()).rejects.toThrow('render failed');
    fail = false;
    await writer.request();
    expect(readFileSync(file, 'utf8')).toBe('ok');
  });
});

describe('RegistryWriter and a reader of the file', () => {
  it('writes the file only by a rename, so a reader never sees a part of it', async () => {
    const { writer, file } = setup();
    await writer.request();
    const targets = vi.mocked(fsPromises.writeFile).mock.calls.map(call => call[0] as string);
    expect(targets).toHaveLength(1);
    expect(basename(targets[0] ?? '')).toMatch(TEMP);
    expect(fsPromises.rename).toHaveBeenCalledWith(targets[0], file);
  });

  it('writes again when the file is deleted or changed, also with the same content', async () => {
    const { writer, file, renders } = setup();
    await writer.request();
    rmSync(file);
    await writer.request();
    expect(readFileSync(file, 'utf8')).toBe('one');
    writeFileSync(file, 'other');
    await writer.request();
    expect(readFileSync(file, 'utf8')).toBe('one');
    expect(renders()).toBe(3);
  });

  it('gives two writers of one file in one process different temp files', async () => {
    const first = setup();
    const second = new RegistryWriter(first.file, async () => {
      await Promise.resolve();
      return 'two';
    });
    await Promise.all([first.writer.request(), second.request()]);
    const temps = vi.mocked(fsPromises.writeFile).mock.calls.map(call => call[0] as string);
    expect(new Set(temps).size).toBe(2);
    expect(['one', 'two']).toContain(readFileSync(first.file, 'utf8'));
    expect(readdirSync(dirname(first.file))).toEqual([basename(first.file)]);
  });

  it('does nothing after close', async () => {
    const { writer, file, renders } = setup();
    writer.close();
    await writer.request();
    expect(renders()).toBe(0);
    expect(() => statSync(file)).toThrow(/ENOENT/u);
  });
});

describe('RegistryWriter and a busy file', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'])('tries the rename again on %s', async code => {
    const { writer, file } = setup();
    fs.renameFailures = 2;
    fs.renameCode = code;
    await writer.request();
    expect(fsPromises.rename).toHaveBeenCalledTimes(3);
    expect(readFileSync(file, 'utf8')).toBe('one');
  });

  it('stops after about 1 s, leaves no temp file, and the next request writes', async () => {
    const { writer, file } = setup();
    fs.renameFailures = 100;
    fs.renameCode = 'EBUSY';
    const start = Date.now();
    await expect(writer.request()).rejects.toThrow('rename failed');
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
    expect(fsPromises.rename).toHaveBeenCalledTimes(6);
    expect(readdirSync(dirname(file))).toEqual([]);
    fs.renameFailures = 0;
    await writer.request();
    expect(readFileSync(file, 'utf8')).toBe('one');
    expect(readdirSync(dirname(file))).toEqual([basename(file)]);
  });

  it('does not try again on another error', async () => {
    const { writer } = setup();
    fs.renameFailures = 1;
    fs.renameCode = 'ENOSPC';
    await expect(writer.request()).rejects.toThrow('rename failed');
    expect(fsPromises.rename).toHaveBeenCalledTimes(1);
  });
});
