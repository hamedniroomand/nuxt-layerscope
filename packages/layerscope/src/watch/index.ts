import { computeEnvKey } from '#src/devtools/env-key.ts';
import { countKeys, diffKeys } from '#src/devtools/finding-keys.ts';
import type { AnalyzeResult, SourceOption } from '#src/types.ts';
import { isOutsideDir, projectRoot } from '#src/utils/fs.ts';

import type { WatchAnalyzer } from './analyzer.ts';
import { createWatchAnalyzer } from './analyzer.ts';
import { isConfigChange } from './ignore.ts';
import {
  buildDirOf,
  buildDirOrDefault,
  configPathOf,
  needsPrepareHint,
  prepareProject,
} from './project.ts';
import { Trigger } from './trigger.ts';
import type { StartWatcher } from './watcher.ts';
import {
  createWatcherWarnings,
  layerDirs,
  messageOf,
  startWatcher,
  watchRoot,
  WatcherSet,
} from './watcher.ts';

const CLEAR_SCREEN = '\u001B[2J\u001B[3J\u001B[H';
const CLEAR_LINE = '\r\u001B[2K';
const UNRESOLVED_HINT = 'hint: run nuxi prepare, or keep nuxi dev running, to refresh auto-imports';

export interface WatchOptions {
  rootDir: string;
  configFile?: string;
  source: SourceOption;
  baseline: string;
  prepare: boolean;
  /** The report of one result, in the format the user chose. */
  render: (result: AnalyzeResult) => string;
  /** `text` and `github` are for people: they get a status line and a clear screen. */
  human: boolean;
  tty: boolean;
  /** Stdout and stderr. */
  write: (text: string) => void;
  warn: (text: string) => void;
  /** Stops the watch; the promise resolves with `0` after the run in progress. */
  signal: AbortSignal;
  delayMs?: number;
  maxWaitMs?: number;
  now?: () => Date;
  startWatcher?: StartWatcher;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function sum(entries: { count: number }[]): number {
  return entries.reduce((total, entry) => total + entry.count, 0);
}

/** What the report shows. When it is the same, the screen is left as it is. */
function outputKey(result: AnalyzeResult): string {
  const { baseline } = result;
  return JSON.stringify([
    result.findings,
    result.notes,
    result.files.length,
    // The text report counts these and the JSON report lists them.
    baseline?.suppressed,
    baseline?.removable,
  ]);
}

/** One `check --watch`: the analyzer, what is on the screen, and the runs. */
class WatchRun {
  private readonly options: WatchOptions;
  private readonly rootDir: string;
  private readonly analyzer: WatchAnalyzer;
  // Raised when a config file changes: it is part of the key, so the next run starts from scratch.
  private epoch = 0;
  private last: AnalyzeResult | undefined;
  private lastKey = '';
  private statusOpen = false;
  // On a terminal, a report clears the screen, so it writes the watcher warnings again.
  private readonly watcherWarnings = createWatcherWarnings();
  private readonly startFailures: string[] = [];

  public constructor(options: WatchOptions) {
    this.options = options;
    this.rootDir = projectRoot(options.rootDir);
    this.analyzer = createWatchAnalyzer({
      rootDir: this.rootDir,
      baseline: options.baseline,
      // Under `nuxi dev`, the registry can be old for a short time after a file change, and a file
      // that Nuxt ignores does not cause a new write. So each run checks again.
      analyze: { configFile: options.configFile, source: options.source, recheckStale: true },
      envKey: async (): Promise<string> => {
        const buildDir = await buildDirOf(this.rootDir, options.configFile);
        return `${computeEnvKey(this.rootDir, buildDir)}|${this.epoch}`;
      },
    });
  }

  public configChanged(): void {
    this.epoch += 1;
  }

  /** The root of each layer, and the source dirs of a layer that are outside its root. */
  public layerDirs(): string[] {
    return layerDirs(this.last?.layers ?? []);
  }

  public async buildDir(): Promise<string> {
    const dir = await buildDirOrDefault(this.rootDir, this.options.configFile);
    return dir;
  }

  public prepare(): void {
    if (!this.options.prepare) {
      return;
    }
    try {
      prepareProject(this.rootDir);
    } catch (error) {
      this.options.warn(`layerscope: ${messageOf(error)}\n`);
    }
  }

  public async run(): Promise<void> {
    try {
      const started = Date.now();
      const { result } = await this.analyzer.refresh();
      const key = outputKey(result);
      if (key === this.lastKey) {
        // Nothing the user sees changed: only the status line moves, so a save that does nothing
        // does not look like a hang.
        this.status('no change');
      } else {
        this.report(result, Date.now() - started);
        this.lastKey = key;
      }
      this.last = result;
    } catch (error) {
      this.statusOpen = false;
      // The error is now the last output, so the next clean run prints its whole report.
      this.lastKey = '';
      this.options.warn(`layerscope: ${messageOf(error)}\n`);
    }
  }

  /** An error of the file watcher. Only the first few texts are shown. */
  public watcherWarning(text: string): void {
    const line = this.watcherWarnings.add(text);
    if (line !== undefined) {
      this.warnLine(line);
    }
  }

  /** A batch of dirs whose watcher could not start. It is always shown, apart from the errors. */
  public startFailure(text: string): void {
    this.startFailures.push(text);
    this.warnLine(text);
  }

  /** Ends the status line, so the shell prompt starts on its own line. */
  public finish(): void {
    if (this.options.tty && this.options.human && this.statusOpen) {
      this.options.write('\n');
    }
  }

  /** A warning on its own line, also after an open status line. */
  private warnLine(line: string): void {
    if (this.options.tty && this.options.human && this.statusOpen) {
      this.options.write('\n');
      this.statusOpen = false;
    }
    this.options.warn(line);
  }

  private clock(): string {
    return (this.options.now?.() ?? new Date()).toLocaleTimeString('en-GB');
  }

  private status(text: string): void {
    const { tty, human } = this.options;
    const line = `${this.clock()}  ${text}  watching, Ctrl+C to exit`;
    const out = human ? this.options.write : this.options.warn;
    if (tty && human) {
      out(`${this.statusOpen ? CLEAR_LINE : ''}${line}`);
      this.statusOpen = true;
    } else {
      out(`${line}\n`);
    }
  }

  private changes(result: AnalyzeResult): string {
    if (this.last === undefined) {
      return plural(result.findings.length, 'finding');
    }
    const delta = diffKeys(
      countKeys(this.last.findings, this.rootDir),
      countKeys(result.findings, this.rootDir),
    );
    return `+${sum(delta.added)} new  -${sum(delta.removed)} fixed`;
  }

  private report(result: AnalyzeResult, ms: number): void {
    const { human, tty } = this.options;
    if (human) {
      this.options.write(tty ? CLEAR_SCREEN : `--- ${this.clock()} ---\n`);
    }
    if (human && tty) {
      // To the terminal that was cleared. Stderr can be a file, which keeps the first copy.
      const replay = `${this.startFailures.join('')}${this.watcherWarnings.replay()}`;
      if (replay !== '') {
        this.options.write(replay);
      }
    }
    this.statusOpen = false;
    this.options.write(this.options.render(result));
    if (result.notes.length > 0) {
      this.options.warn(result.notes.map(note => `layerscope: note: ${note}\n`).join(''));
    }
    if (needsPrepareHint(result.findings)) {
      (human ? this.options.write : this.options.warn)(`${UNRESOLVED_HINT}\n`);
    }
    this.status(`${plural(result.files.length, 'file')}  ${this.changes(result)}  ${ms} ms`);
  }
}

async function untilAborted(signal: AbortSignal): Promise<void> {
  await new Promise<void>(resolveStop => {
    if (signal.aborted) {
      resolveStop();
      return;
    }
    signal.addEventListener('abort', () => {
      resolveStop();
    });
  });
}

/**
 * `layerscope check --watch`: a full check, then a check again after each change. Resolves with
 * `0` when `signal` aborts. A run that fails is reported and the watch goes on.
 */
export async function watchCheck(options: WatchOptions): Promise<number> {
  const watch = new WatchRun(options);
  watch.prepare();
  const rootDir = projectRoot(options.rootDir);
  const configPath = configPathOf(rootDir, options.configFile);
  const handle: { watchers?: WatcherSet } = {};
  // Layers and source dirs outside the project root are known after a run, and a run can add more.
  const watchNewRoots = (): void => {
    if (!options.signal.aborted) {
      handle.watchers?.add(watch.layerDirs().filter(root => isOutsideDir(root, rootDir)));
    }
  };
  const trigger = new Trigger(
    async () => {
      await watch.run();
      watchNewRoots();
    },
    options.delayMs ?? 150,
    options.maxWaitMs ?? 1000,
  );
  const watchers = new WatcherSet({
    start: options.startWatcher ?? startWatcher,
    buildDir: await watch.buildDir(),
    onChange: (change): void => {
      if (change.config || isConfigChange(change.path, configPath)) {
        watch.configChanged();
      }
      trigger.touch();
    },
    // One more run reads the files in the new dirs that changed before they were watched.
    onReady: trigger.touch.bind(trigger),
    warn: watch.watcherWarning.bind(watch),
    warnStart: watch.startFailure.bind(watch),
  });
  handle.watchers = watchers;
  const aborted = untilAborted(options.signal);
  // A config file given with `--config` can be outside the root.
  const paths = configPath === undefined ? [rootDir] : [rootDir, configPath];
  if (await watchRoot(watchers, paths, aborted, trigger.stop.bind(trigger))) {
    await watch.run();
    watchNewRoots();
  }
  await aborted;
  trigger.stop();
  await watchers.close();
  await trigger.idle();
  watch.finish();
  return 0;
}
