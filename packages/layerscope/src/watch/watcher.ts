import { LayerscopeError } from '#src/errors.ts';
import { sourceDirsOutsideRoot } from '#src/nuxt/owner.ts';
import type { Layer } from '#src/types.ts';
import { isOutsideDir } from '#src/utils/fs.ts';
import { plural } from '#src/utils/strings.ts';

import { createIgnore, isConfigFile } from './ignore.ts';

export interface Change {
  path: string;
  /** A config file changed: drop the caches. */
  config: boolean;
}

export interface Watcher {
  /** Resolves when the first scan is done. It never rejects. */
  ready: Promise<void>;
  close: () => Promise<void>;
}

/**
 * Starts a watcher on the paths. It resolves at once, before the first scan is done, and rejects
 * only when the watcher cannot start. Each error that the watcher reports later goes to
 * `onError`, and the watcher goes on.
 */
export type StartWatcher = (
  paths: string[],
  buildDir: string,
  onChange: (change: Change) => void,
  onError: (error: unknown) => void,
) => Promise<Watcher>;

/** The root of each layer, and the source dirs of a layer that are outside its root. */
export function layerDirs(layers: Layer[]): string[] {
  return layers.flatMap(layer => [layer.root].concat(sourceDirsOutsideRoot(layer)));
}

/** Watches the paths until closed. `ready` resolves once the first scan is done. */
export const startWatcher: StartWatcher = async (paths, buildDir, onChange, onError) => {
  // Loaded here, so a one-shot check and the API never load it.
  const { watch } = await import('chokidar');
  const watcher = watch(paths, {
    ignoreInitial: true,
    ignored: createIgnore(buildDir),
  });
  for (const event of ['add', 'change', 'unlink'] as const) {
    watcher.on(event, path => {
      onChange({ path, config: isConfigFile(path) });
    });
  }
  // Also before `ready`: chokidar reports a subdir that it cannot read, and then goes on. An
  // `error` event with no listener would throw.
  watcher.on('error', onError);
  const ready = new Promise<void>(resolve => {
    watcher.once('ready', resolve);
  });
  return {
    ready,
    close: async (): Promise<void> => {
      await watcher.close();
    },
  };
};

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The file watcher puts a path in each error, so a dir tree it cannot read can give many texts. */
const SHOWN_WARNINGS = 5;
const MORE_WARNINGS =
  'layerscope: The file watcher reported more errors. They are not shown, and the watch goes on.\n';

/** The warnings of the file watcher: the first few texts, and a count of the texts after them. */
export interface WatcherWarnings {
  /**
   * Keeps a new text and gives the line to print now: the text itself, or for the first text
   * after the shown ones, one line that says that there are more. A text that came before, and
   * every later text, give nothing.
   */
  add: (text: string) => string | undefined;
  /** The shown texts, and a line with the count of the others, for a screen that was cleared. */
  replay: () => string;
}

export function createWatcherWarnings(): WatcherWarnings {
  const shown = new Set<string>();
  const hidden = new Set<string>();
  return {
    add: text => {
      if (shown.has(text) || hidden.has(text)) {
        return;
      }
      if (shown.size < SHOWN_WARNINGS) {
        shown.add(text);
        return text;
      }
      hidden.add(text);
      return hidden.size === 1 ? MORE_WARNINGS : undefined;
    },
    replay: () => {
      const more =
        hidden.size === 0
          ? ''
          : `layerscope: The file watcher reported ${plural(hidden.size, 'more error')}. They are not shown.\n`;
      return `${[...shown].join('')}${more}`;
    },
  };
}

export interface WatcherSetOptions {
  start: StartWatcher;
  buildDir: string;
  onChange: (change: Change) => void;
  /** The first scan of a new batch is done. */
  onReady: () => void;
  /** An error that a watcher reported. */
  warn: (text: string) => void;
  /** A batch whose watcher could not start. */
  warnStart: (text: string) => void;
}

/**
 * The file watchers of one watch: one on the project root, and one for each batch of dirs outside
 * the root that a run finds. A new batch gets its own watcher, because chokidar tells only once
 * that its first scan is done, and the run after the batch must start after that scan.
 */
export class WatcherSet {
  private readonly options: WatcherSetOptions;
  private readonly watched: string[] = [];
  private readonly open: Watcher[] = [];
  private closed = false;

  public constructor(options: WatcherSetOptions) {
    this.options = options;
  }

  /**
   * Watches the project root. A failure to start stops the watch, so the caller gets the error.
   * The caller waits for `ready` before the first run, so that no edit is missed.
   */
  public async startRoot(paths: string[]): Promise<Watcher> {
    const watcher = await this.start(paths);
    this.watched.push(...paths);
    this.open.push(watcher);
    return watcher;
  }

  /**
   * Watches the dirs that no watcher covers yet, and calls `onReady` when the first scan of the
   * new watcher is done. The caller does not wait: a slow scan must not stop the runs. A dir
   * inside a watched dir is skipped. A batch that cannot start gives one warning and is not
   * tried again.
   */
  public add(dirs: string[]): void {
    if (this.closed) {
      return;
    }
    // Parents first, so that a dir inside another new dir of the batch is skipped.
    const fresh: string[] = [];
    for (const dir of dirs.toSorted((a, b) => a.length - b.length)) {
      if (this.watched.every(watched => isOutsideDir(dir, watched))) {
        this.watched.push(dir);
        fresh.push(dir);
      }
    }
    if (fresh.length > 0) {
      this.watchBatch(fresh).catch((error: unknown) => {
        this.warnError(error);
      });
    }
  }

  /** Closes every watcher, also one whose first scan is not done. It does not wait for a scan. */
  public async close(): Promise<void> {
    this.closed = true;
    // One close that fails must not keep the others open.
    await Promise.allSettled(
      this.open.map(async watcher => {
        await watcher.close();
      }),
    );
  }

  private async watchBatch(dirs: string[]): Promise<void> {
    let watcher: Watcher;
    try {
      watcher = await this.start(dirs);
    } catch (error) {
      this.options.warnStart(
        `layerscope: Cannot watch ${dirs.join(', ')}: ${messageOf(error)}. Changes in these dirs are not seen until the watch starts again.\n`,
      );
      return;
    }
    // The start can end after the close: the close did not see this watcher.
    if (this.closed) {
      await watcher.close();
      return;
    }
    this.open.push(watcher);
    await watcher.ready;
    if (!this.isClosed()) {
      this.options.onReady();
    }
  }

  /** A method, because the type check does not see that `closed` can change during an `await`. */
  private isClosed(): boolean {
    return this.closed;
  }

  private async start(paths: string[]): Promise<Watcher> {
    const { start, buildDir, onChange } = this.options;
    const watcher = await start(paths, buildDir, onChange, error => {
      this.warnError(error);
    });
    return watcher;
  }

  private warnError(error: unknown): void {
    this.options.warn(
      `layerscope: The file watcher reported an error: ${messageOf(error)}. The watch goes on.\n`,
    );
  }
}

/**
 * Watches the project root, and resolves `true` when its first scan is done, so that the first
 * run misses no edit. It resolves `false` when the watch stops during the scan. A failure to start
 * calls `onFail`, closes every watcher, and throws.
 */
export async function watchRoot(
  watchers: WatcherSet,
  paths: string[],
  aborted: Promise<void>,
  onFail: () => void,
): Promise<boolean> {
  const root = await watchers.startRoot(paths).catch(async (error: unknown) => {
    onFail();
    await watchers.close();
    throw new LayerscopeError(`Cannot watch ${paths[0] ?? ''}: ${messageOf(error)}`);
  });
  const scanned = await Promise.race([root.ready.then(() => true), aborted.then(() => false)]);
  return scanned;
}
