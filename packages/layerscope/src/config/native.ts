import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** A file that Node imports itself, and caches. jiti transpiles `.ts` and `.mts` on each load. */
export function isNodeModule(file: string): boolean {
  return file.endsWith('.mjs') || file.endsWith('.js');
}

/** Node keeps a CommonJS config in its require cache, by real path, and jiti loads it from there. */
export function forgetCommonJs(file: string): void {
  const { cache } = createRequire(file);
  /* eslint-disable @typescript-eslint/no-dynamic-delete */
  delete cache[file];
  delete cache[realpathSync(file)];
  /* eslint-enable @typescript-eslint/no-dynamic-delete */
}

/** Node warns about a `.js` file with ES module syntax in a CommonJS package; jiti loads it anyway. */
function isEsmTypeWarning(warning: unknown): boolean {
  const message = typeof warning === 'string' ? warning : (warning as Error | undefined)?.message;
  return message?.startsWith('Failed to load the ES module') === true;
}

type Emit = typeof process.emit;

/**
 * Loads can overlap in one process (the DevTools tab and a watch or MCP refresh), so the filter is
 * installed by the first and removed by the last, and the original method is saved once.
 */
const filter: { active: number; original?: Emit } = { active: 0 };

const dropEsmTypeWarning = (event: string, ...args: unknown[]): boolean => {
  if (event === 'warning' && isEsmTypeWarning(args[0])) {
    return false;
  }
  return (filter.original as (event: string, ...args: unknown[]) => boolean).call(
    process,
    event,
    ...args,
  );
};

function installFilter(): void {
  if (filter.active === 0) {
    // The method is put back as it was, and called with `process` as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    filter.original = process.emit;
    process.emit = dropEsmTypeWarning as Emit;
  }
  filter.active += 1;
}

function removeFilter(): void {
  filter.active -= 1;
  if (filter.active === 0 && filter.original !== undefined) {
    process.emit = filter.original;
    filter.original = undefined;
  }
}

/**
 * Runs `task` with that one warning dropped. Node queues the warning and prints it from the
 * `warning` event, so the event is the place to drop it, and one more turn of the event loop lets
 * a queued warning arrive before the filter is removed. Every other warning still reaches the user.
 */
async function withoutEsmTypeWarning<T>(task: () => Promise<T>): Promise<T> {
  installFilter();
  try {
    return await task();
  } finally {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
    removeFilter();
  }
}

/**
 * Imports a `.mjs` or `.js` config under a URL with a hash of its content. Node caches a module by
 * URL, so a changed file gets a fresh copy and an unchanged file keeps the cached one. jiti cannot
 * do this: it drops the query and imports the file natively. A CommonJS file also leaves the
 * require cache first, because Node reads it from there.
 *
 * Any failure comes back as `error`, and the caller tries jiti: it loads configs that Node does not
 * (ES module syntax in a CommonJS package, `module.exports` in an ES module package, a JSON import
 * without an attribute, a package that only the alias of this package finds).
 */
export async function importNative(file: string): Promise<{ value: unknown } | { error: unknown }> {
  try {
    forgetCommonJs(file);
    const hash = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 12);
    const module = await withoutEsmTypeWarning(
      async () => (await import(`${pathToFileURL(file).href}?v=${hash}`)) as object,
    );
    // `export default null` is a default export that is not a config: it must reach the check.
    return { value: 'default' in module ? module.default : module };
  } catch (error) {
    return { error };
  }
}
