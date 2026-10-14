import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

import { dirname } from 'pathe';

/** The waits before each new try of a rename, about 1 s in total. */
const RENAME_WAITS_MS = [50, 100, 200, 300, 400];

/** On Windows, a rename over a file fails with these codes while another program holds the file. */
const BUSY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

/** Makes the temp names of all writers in one process different. */
let tempCount = 0;

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function nextTick(): Promise<void> {
  await new Promise(resolve => {
    setImmediate(resolve);
  });
}

function codeOf(error: unknown): unknown {
  return (error as NodeJS.ErrnoException).code;
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

/** The content of the file, or `null` when there is no file (ENOENT). */
async function contentOf(file: string): Promise<string | null> {
  try {
    const content = await readFile(file, 'utf8');
    return content;
  } catch (error) {
    if (codeOf(error) === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Renames the file, and tries again while the target is busy. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (const ms of [...RENAME_WAITS_MS, null]) {
    try {
      // eslint-disable-next-line no-await-in-loop -- each try waits for the one before
      await rename(from, to);
      return;
    } catch (error) {
      if (ms === null || !BUSY_CODES.has(String(codeOf(error)))) {
        throw error;
      }
    }
    // eslint-disable-next-line no-await-in-loop -- the wait gives the other program time
    await wait(ms);
  }
}

/** Removes the temp file of a failed write. A temp file that is not there is not an error. */
async function removeTemp(temp: string, cause: unknown): Promise<void> {
  try {
    await rm(temp);
  } catch (error) {
    if (codeOf(error) !== 'ENOENT') {
      throw new Error(
        `${messageOf(cause)}. Also, ${temp} could not be removed: ${messageOf(error)}`,
        {
          cause,
        },
      );
    }
  }
}

/**
 * Writes the registry file. Requests in the same tick share one write, and only one write runs at a
 * time. A request during a write gives one more write after it, so the file gets the last state.
 * The file is not written again when it has the same content, so its mtime does not change and
 * `check --watch` does not start a run for it. A write goes to a temp file first and then replaces
 * the file, so a reader gets the old or the new content and never a part of it.
 */
export class RegistryWriter {
  private readonly file: string;
  private readonly render: () => Promise<string>;
  /** The write that has not started yet. New requests join it. */
  private queued: Promise<void> | null = null;
  /** The end of the last write, failed or not. The next write starts after it. */
  private last: Promise<unknown> = Promise.resolve();
  private closed = false;

  public constructor(file: string, render: () => Promise<string>) {
    this.file = file;
    this.render = render;
  }

  public async request(): Promise<void> {
    if (this.closed) {
      return;
    }
    if (this.queued !== null) {
      await this.queued;
      return;
    }
    const run = this.last.then(nextTick).then(async () => {
      // From here, a new request makes a new write: this one can miss its change.
      this.queued = null;
      if (!this.closed) {
        await this.write();
      }
    });
    this.queued = run;
    this.last = run.catch(() => null);
    await run;
  }

  /** Stops the writer when Nuxt closes: requests after this do nothing. */
  public close(): void {
    this.closed = true;
  }

  private async write(): Promise<void> {
    const content = await this.render();
    // The file on disk, not the last write: the file can be deleted or replaced while Nuxt runs.
    if (content === (await contentOf(this.file))) {
      return;
    }
    await mkdir(dirname(this.file), { recursive: true });
    tempCount += 1;
    const temp = `${this.file}.${process.pid}.${tempCount}.tmp`;
    try {
      await writeFile(temp, content);
      // After a soft restart of `nuxi dev`, the new Nuxt writes the file. The old writer must not
      // replace it. A close between this check and the rename can still replace it once, and the
      // next write of the new Nuxt corrects it.
      if (this.closed) {
        await rm(temp);
        return;
      }
      await renameWithRetry(temp, this.file);
    } catch (error) {
      await removeTemp(temp, error);
      throw error;
    }
  }
}
