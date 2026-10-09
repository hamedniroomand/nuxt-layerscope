import { join, resolve } from 'pathe';

import { prepareNuxt } from '#src/analyze/prepare.ts';
import { loadConfig } from '#src/config/load.ts';
import { Analyzer } from '#src/devtools/analyzer.ts';
import { computeEnvKey } from '#src/devtools/env-key.ts';
import { countKeys, diffKeys } from '#src/devtools/finding-keys.ts';
import { LayerscopeError } from '#src/errors.ts';
import type { AnalyzeResult, SourceOption } from '#src/types.ts';

import { Trigger } from './trigger.ts';
import type { StartWatcher } from './watcher.ts';
import { startWatcher } from './watcher.ts';

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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What the screen shows: findings the baseline accepts do not change it, notes and files do. */
function outputKey(result: AnalyzeResult): string {
  return JSON.stringify([result.findings, result.notes, result.files.length]);
}

async function buildDirOf(rootDir: string, configFile?: string): Promise<string> {
  const config = await loadConfig(rootDir, configFile);
  return resolve(rootDir, config.buildDir ?? '.nuxt');
}

/** One `check --watch`: the analyzer, what is on the screen, and the runs. */
class WatchRun {
  private readonly options: WatchOptions;
  private readonly rootDir: string;
  private readonly analyzer: Analyzer;
  // Raised when a config file changes: it is part of the key, so the next run starts from scratch.
  private epoch = 0;
  private last: AnalyzeResult | undefined;
  private lastKey = '';
  private statusOpen = false;

  public constructor(options: WatchOptions) {
    this.options = options;
    this.rootDir = resolve(options.rootDir);
    this.analyzer = new Analyzer({
      rootDir: this.rootDir,
      baseline: options.baseline,
      analyze: { configFile: options.configFile, source: options.source },
      envKey: async (): Promise<string> => {
        const buildDir = await buildDirOf(this.rootDir, options.configFile);
        return `${computeEnvKey(this.rootDir, buildDir)}|${this.epoch}`;
      },
    });
  }

  public configChanged(): void {
    this.epoch += 1;
  }

  public layerRoots(): string[] {
    return (this.last?.layers ?? []).map(layer => layer.root);
  }

  public async buildDir(): Promise<string> {
    const dir = await buildDirOf(this.rootDir, this.options.configFile).catch(() =>
      join(this.rootDir, '.nuxt'),
    );
    return dir;
  }

  public prepare(): void {
    if (!this.options.prepare) {
      return;
    }
    try {
      prepareNuxt(this.rootDir);
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
      this.options.warn(`layerscope: ${messageOf(error)}\n`);
    }
  }

  /** Ends the status line, so the shell prompt starts on its own line. */
  public finish(): void {
    if (this.options.tty && this.options.human && this.statusOpen) {
      this.options.write('\n');
    }
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
    this.statusOpen = false;
    this.options.write(this.options.render(result));
    if (result.notes.length > 0) {
      this.options.warn(result.notes.map(note => `layerscope: note: ${note}\n`).join(''));
    }
    if (result.findings.some(finding => finding.rule === 'unresolved-reference')) {
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
  const trigger = new Trigger(
    async () => {
      await watch.run();
    },
    options.delayMs ?? 150,
    options.maxWaitMs ?? 1000,
  );
  const start = options.startWatcher ?? startWatcher;
  const rootDir = resolve(options.rootDir);
  const watcher = await start([rootDir], await watch.buildDir(), change => {
    if (change.config) {
      watch.configChanged();
    }
    trigger.touch();
  }).catch((error: unknown) => {
    throw new LayerscopeError(`Cannot watch ${rootDir}: ${messageOf(error)}`);
  });
  await watch.run();
  // The root covers the layers inside it; the others are added once they are known.
  watcher.add(watch.layerRoots().filter(root => !root.startsWith(`${rootDir}/`)));
  await untilAborted(options.signal);
  trigger.stop();
  await watcher.close();
  await trigger.idle();
  watch.finish();
  return 0;
}
