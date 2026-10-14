import { useLogger } from '@nuxt/kit';
import { resolve } from 'pathe';

import type { Nuxt } from './nuxt.ts';

/** The watcher events that can add or remove a scanned file. */
const FILE_EVENTS = new Set(['add', 'unlink', 'addDir', 'unlinkDir']);

export interface DevWrites {
  /** Writes the registry. Requests that come close together share one write. */
  request: () => Promise<void>;
  /** Whether the last registry recorded the file in an auto-import dir of Nitro. */
  isNitroImportFile: (file: string) => boolean;
  /** Runs after a write that a watcher event started. */
  afterWatchWrite: () => void;
}

/** Writes the registry. An error is logged and not thrown, because it must not stop `nuxi dev`. */
async function writeAndLog(request: () => Promise<void>): Promise<void> {
  await request().catch((error: unknown) => {
    const cause = error instanceof Error ? error.message : String(error);
    useLogger('nuxt-layerscope').error(`nuxt-layerscope could not write the registry: ${cause}`);
  });
}

/**
 * Writes the registry when Nuxt generates types: `nuxi prepare`, `nuxi build` and the start of
 * `nuxi dev`. Under `nuxi dev`, an error is logged and not thrown. A thrown error would stop the
 * other handlers of the hook, and Nuxt would not write the rest of its types. Else the error
 * stops the run, so that the run shows that the registry was not written.
 */
export function writeOnPrepareTypes(nuxt: Nuxt, request: () => Promise<void>): void {
  nuxt.hook('prepare:types', async () => {
    await (nuxt.options.dev ? writeAndLog(request) : request());
  });
}

/** Writes the registry again while `nuxi dev` runs. An error is logged and not thrown. */
export function writeOnDevChanges(nuxt: Nuxt, writes: DevWrites): void {
  let closed = false;
  nuxt.hook('close', () => {
    closed = true;
  });
  const write = async (): Promise<void> => {
    await writeAndLog(writes.request);
  };
  // Components and imports are rescanned while `nuxi dev` runs.
  nuxt.hook('app:templatesGenerated', write);
  // A new or deleted file does not always change a template. An example is a server util. Nuxt
  // scans the app again in its own `builder:watch` handler. It adds that handler when the build
  // starts. This handler is added after the build, so it usually runs after that scan.
  // The collector reads the app part only after a scan of Nuxt, so the order is not important
  // for most changes. One case remains: an `app:templatesGenerated` from an update of the app
  // imports can come while a scan of the components is still to come. Then the write records a
  // new component file that the list of Nuxt does not have yet. The write after the next
  // `components:extend` corrects it.
  nuxt.hooks.hookOnce('build:done', () => {
    nuxt.hook('builder:watch', async (event, path) => {
      if (closed) {
        return;
      }
      // Nuxt 3 gives a path relative to `srcDir` (when `experimental.relativeWatchPaths` is on, the
      // default), and Nuxt 4 an absolute path. This makes an absolute path of both.
      const file = resolve(nuxt.options.srcDir, path);
      // An edit can rename an export of a server auto-import file, and Nuxt writes no template for
      // it. An app file edit goes through `app:templatesGenerated`. When this misses an edit, the
      // stale check does not see it either: run `nuxi prepare`, as before.
      if (FILE_EVENTS.has(event) || (event === 'change' && writes.isNitroImportFile(file))) {
        await write();
        // The DevTools tab handled the event before this write, so it can have read the old
        // registry. This makes it read the registry again.
        writes.afterWatchWrite();
      }
    });
  });
}
