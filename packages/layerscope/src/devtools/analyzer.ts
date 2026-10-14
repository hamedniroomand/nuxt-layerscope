import { createHash, randomUUID } from 'node:crypto';

import { AnalysisCache, createEnvironmentCache } from '#src/analyze/cache.ts';
import type { AnalyzeOptions } from '#src/analyze/index.ts';
import { baselinePath } from '#src/baseline/index.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { projectRoot } from '#src/utils/fs.ts';

import { layerStats } from './stats.ts';

export interface Snapshot {
  /** Identifies this analyzer, so a revision from before a restart never matches. */
  id: string;
  rev: number;
  analyzedAt: number;
  durationMs: number;
  result: AnalyzeResult;
  /** `baseline`: the tab wrote the baseline file and it was applied again, without a new analysis. */
  cause: 'analysis' | 'baseline';
}

export interface AnalyzerOptions {
  rootDir: string;
  /** Baseline file relative to `rootDir`. */
  baseline: string;
  envKey: () => Promise<string> | string;
  /**
   * Also read the files that only `unused` reads, for the Unused view. Only the DevTools server
   * sets it: the watch mode and the MCP server do not need those files.
   */
  extraFiles?: boolean;
  /** More options for every run, such as the config file the CLI was given. */
  analyze?: Pick<AnalyzeOptions, 'configFile' | 'source'>;
  /** Defaults to `analyze`, imported on first use so it stays out of Nuxt's startup. */
  run?: (options: AnalyzeOptions) => Promise<AnalyzeResult>;
}

/** What a use is for the views: its kind, its name, the file that has it and the file it reaches. */
function usesOf(edges: AnalyzeResult['edges']): (string | null)[][] {
  return edges.map(edge => [edge.kind, edge.symbol, edge.file, edge.to]);
}

/** The registered names with their files, per context and for components. */
function symbolsOf(symbols: AnalyzeResult['symbols']): [string, string | null][][] {
  const maps = [symbols.components, ...Object.values(symbols.imports)];
  return maps.map(map => [...map].map(([name, target]) => [name, target.file]));
}

/**
 * The output the revision tracks: what the tab shows. The symbol table and the edges are large,
 * so the per-layer statistics stand in for them in the Graph view, and the Unused view, which
 * reads the uses, the symbols and the unread files, is covered by a hash of a short form of them.
 */
function fingerprint(result: AnalyzeResult): string {
  const unused = createHash('sha1')
    .update(
      JSON.stringify([
        usesOf(result.edges),
        usesOf(result.extraEdges),
        usesOf(result.typeEdges),
        symbolsOf(result.symbols),
        result.dynamicComponentFiles,
        result.unreadFiles,
      ]),
    )
    .digest('hex');
  return JSON.stringify([
    result.findings,
    result.baseline?.suppressed,
    result.config.layers,
    result.config.typeImports,
    layerStats(result),
    result.files.length,
    result.notes,
    unused,
  ]);
}

/** Analyzes lazily, shares one run between concurrent callers, and reuses per-file work. */
export class Analyzer {
  private readonly options: AnalyzerOptions;
  private readonly id = randomUUID();
  private readonly cache = new AnalysisCache();
  private readonly environment = createEnvironmentCache();
  private snapshot: Snapshot | undefined;
  private lastFingerprint = '';
  private dirty = true;
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private inflight: Promise<Snapshot> | undefined;
  private queued: Promise<Snapshot> | undefined;

  public constructor(options: AnalyzerOptions) {
    this.options = { ...options, rootDir: projectRoot(options.rootDir) };
  }

  public get current(): Snapshot | undefined {
    return this.snapshot;
  }

  /** Calls `listener` with every new snapshot, whatever started the run. */
  public subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /** Marks the snapshot stale; the next `get` re-analyzes. Does no work itself. */
  public invalidate(): void {
    this.dirty = true;
  }

  public async get(): Promise<Snapshot> {
    if (this.snapshot !== undefined && !this.dirty) {
      return this.snapshot;
    }
    const running = this.inflight ?? this.start();
    const snapshot = await running;
    return snapshot;
  }

  /** Always analyzes after the call: a run already in flight may predate the request. */
  public async refresh(): Promise<Snapshot> {
    if (this.inflight === undefined) {
      const snapshot = await this.start();
      return snapshot;
    }
    // Everyone who asks while a run is in flight shares the one run queued behind it.
    this.queued ??= this.afterInflight();
    const snapshot = await this.queued;
    return snapshot;
  }

  private async afterInflight(): Promise<Snapshot> {
    await Promise.allSettled([this.inflight]);
    this.queued = undefined;
    const snapshot = await this.refresh();
    return snapshot;
  }

  private async start(): Promise<Snapshot> {
    this.inflight = this.analyze().finally(() => {
      this.inflight = undefined;
    });
    const snapshot = await this.inflight;
    return snapshot;
  }

  /** The baseline file the tab reads and writes. */
  public get baselineFile(): string {
    return baselinePath(this.options.rootDir, this.options.baseline);
  }

  /**
   * Applies the baseline file again to the last result, after the tab wrote it: no file is
   * analyzed again. Waits for an analysis in flight, and later requests wait for this one.
   */
  public async rebaseline(): Promise<Snapshot> {
    // Another run can start while this one waits, so wait until none is in flight and a
    // snapshot exists; the check and the claim below then happen without a gap.
    while (this.inflight !== undefined || this.snapshot === undefined) {
      // eslint-disable-next-line no-await-in-loop -- waits for each run in turn
      await (this.inflight === undefined ? this.get() : Promise.allSettled([this.inflight]));
    }
    const base = this.snapshot;
    this.inflight = this.reapply(base).finally(() => {
      this.inflight = undefined;
    });
    const snapshot = await this.inflight;
    return snapshot;
  }

  private async reapply(base: Snapshot): Promise<Snapshot> {
    const started = Date.now();
    const [{ applyBaselineFile }, { compareByPosition }, { withSuggestions }] = await Promise.all([
      import('#src/baseline/index.ts'),
      import('#src/rules/compare.ts'),
      import('#src/suggest/index.ts'),
    ]);
    const { result } = base;
    const all = [...result.findings, ...(result.baseline?.suppressed ?? [])].toSorted(
      compareByPosition,
    );
    const fresh = { ...result, findings: all, baseline: undefined };
    // The suggestions count the findings that are shown, so they are made again.
    const applied = await withSuggestions(applyBaselineFile(fresh, this.baselineFile));
    return this.commit(applied, started, 'baseline');
  }

  private async analyze(): Promise<Snapshot> {
    // Cleared before the run, so an invalidation that lands mid-run is kept for the next request.
    this.dirty = false;
    const started = Date.now();
    try {
      const run = this.options.run ?? (await import('#src/analyze/index.ts')).analyze;
      const result = await run({
        ...this.options.analyze,
        rootDir: this.options.rootDir,
        baseline: this.options.baseline,
        cache: this.cache,
        environment: this.environment,
        envKey: await this.options.envKey(),
        extraFiles: this.options.extraFiles,
      });
      return this.commit(result, started, 'analysis');
    } catch (error) {
      this.dirty = true;
      throw error;
    }
  }

  /** Stores a new snapshot, bumping the revision when the output changed, and tells listeners. */
  private commit(result: AnalyzeResult, started: number, cause: Snapshot['cause']): Snapshot {
    const next = fingerprint(result);
    const changed = this.snapshot !== undefined && next !== this.lastFingerprint;
    this.lastFingerprint = next;
    const snapshot: Snapshot = {
      id: this.id,
      rev: (this.snapshot?.rev ?? 0) + (changed ? 1 : 0),
      analyzedAt: Date.now(),
      durationMs: Date.now() - started,
      result,
      cause,
    };
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // A listener must not fail the request that started the run.
      }
    }
    return snapshot;
  }
}
